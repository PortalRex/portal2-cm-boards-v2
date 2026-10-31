-- Re-ranks every co-op run in the changelog the way the boards rank them (RANKS.COOP = run, the
-- default): each co-op run takes one place, not one per player as on the old boards, whose ranks
-- the old-board import and sync copied in. Run once; the old-board sync and submissions rank new
-- co-op runs this way already.
--
-- Each run gets the ranks it had when it was set, as the server's rank query (submissions.rs
-- FASTER_RUNS) gives them: post_rank = 1 + the co-op runs faster than it by then (each other
-- player's best then; a run counts once both halves are verified and nobody on it is banned);
-- pre_rank = the same for the player's best just before it (none for a first time). Only runs
-- that have ranks now are changed; season copies (mirror_of) keep theirs. The old board's ranks
-- still win where it knew better (below): world records stay as they were.
--
-- A dry run unless `-v apply=1` is given: it reports what would change and rolls back.
--   psql -U "$POSTGRES_USER" -d p2boards -f rerank_coop_runs.sql             (dry run)
--   psql -U "$POSTGRES_USER" -d p2boards -v apply=1 -f rerank_coop_runs.sql  (for real)

\set ON_ERROR_STOP on
\timing on
SET search_path TO p2boards, public;
BEGIN;

-- Every co-op entry, with whether it counts towards others' ranks.
CREATE TEMP TABLE coop_entries ON COMMIT DROP AS
SELECT cl.id, cl.profile_number, cl.score, cl.map_id, cl.category_id, cl.timestamp, cl.post_rank, cl.pre_rank,
       cl.mirror_of, cl.verified, cl.banned,
       COALESCE('c' || cl.coop_id, 'r' || cl.id) AS run_key,
       (cl.verified AND NOT cl.banned AND NOT u.banned AND NOT EXISTS (
           SELECT 1 FROM coop_bundled AS cb
               JOIN changelog AS o ON o.id IN (cb.cl_id1, cb.cl_id2) AND o.id <> cl.id
               JOIN users AS ou ON ou.profile_number = o.profile_number
           WHERE cb.id = cl.coop_id AND (NOT o.verified OR o.banned OR ou.banned)
       )) AS counts
FROM changelog AS cl
    JOIN users AS u ON u.profile_number = cl.profile_number
    JOIN maps AS m ON m.steam_id = cl.map_id
    JOIN chapters AS ch ON ch.id = m.chapter_id
WHERE ch.is_multiplayer;
CREATE INDEX ON coop_entries (map_id, category_id, score);
CREATE INDEX ON coop_entries (profile_number, map_id, category_id, score);
ANALYZE coop_entries;

-- The co-op runs faster than `p_score` by `p_at`, not counting `p_player` (or the placeholder
-- partner). (Arguments named like columns would lose to them, hence the p_.)
-- FASTER_RUNS itself. Slow (it sorts every faster entry), so only for the few undated runs.
CREATE FUNCTION pg_temp.faster_runs(p_map text, p_cat int, p_score int, p_player text, p_at timestamp) RETURNS bigint
LANGUAGE sql STABLE AS $$
    SELECT COUNT(DISTINCT pb.run_key) FROM (
        SELECT DISTINCT ON (o.profile_number) o.run_key
        FROM coop_entries AS o
        WHERE o.map_id = p_map AND o.category_id = p_cat AND o.score < p_score AND o.counts
          AND o.profile_number <> p_player AND o.profile_number <> 'N/A'
          AND (p_at IS NULL OR o.timestamp <= p_at)
        ORDER BY o.profile_number, o.score, o.timestamp, o.id
    ) AS pb
$$;

-- The same for a dated run, quickly: each counting entry with when it was its player's best (from
-- when it was set until one of theirs beat it), so a run's rank counts the entries that were bests
-- when it was set, with no sorting.
CREATE TEMP TABLE bests ON COMMIT DROP AS
SELECT o.map_id, o.category_id, o.profile_number, o.score, o.run_key, o.timestamp AS from_ts,
       (SELECT MIN(n.timestamp) FROM coop_entries AS n
        WHERE n.counts AND n.profile_number = o.profile_number AND n.map_id = o.map_id
          AND n.category_id = o.category_id AND n.id <> o.id
          -- Ties (the same time, set at the same moment, filed twice): the first entry is the best.
          AND (n.score < o.score OR (n.score = o.score AND (n.timestamp, n.id) < (o.timestamp, o.id)))) AS to_ts
FROM coop_entries AS o
WHERE o.counts AND o.profile_number <> 'N/A' AND o.timestamp IS NOT NULL;
CREATE INDEX ON bests (map_id, category_id, score);
ANALYZE bests;

CREATE FUNCTION pg_temp.faster_runs_at(p_map text, p_cat int, p_score int, p_player text, p_at timestamp) RETURNS bigint
LANGUAGE sql STABLE AS $$
    SELECT COUNT(DISTINCT b.run_key) FROM bests AS b
    WHERE b.map_id = p_map AND b.category_id = p_cat AND b.score < p_score AND b.profile_number <> p_player
      AND b.from_ts <= p_at AND (b.to_ts IS NULL OR p_at < b.to_ts)
$$;

CREATE FUNCTION pg_temp.rank_at(p_map text, p_cat int, p_score int, p_player text, p_at timestamp) RETURNS int
LANGUAGE sql STABLE AS $$
    SELECT (1 + CASE WHEN p_at IS NULL THEN pg_temp.faster_runs(p_map, p_cat, p_score, p_player, p_at)
                     ELSE pg_temp.faster_runs_at(p_map, p_cat, p_score, p_player, p_at) END)::int
$$;

CREATE TEMP TABLE counted ON COMMIT DROP AS
SELECT r.id, r.post_rank AS old_post, r.pre_rank AS old_pre,
       pg_temp.rank_at(r.map_id, r.category_id, r.score, r.profile_number, r.timestamp) AS counted_post,
       CASE WHEN prev.score IS NOT NULL
            THEN pg_temp.rank_at(r.map_id, r.category_id, prev.score, r.profile_number, r.timestamp)
       END AS counted_pre
FROM coop_entries AS r
    -- The player's best before this run (what it improved on), as the sync works it out.
    LEFT JOIN LATERAL (
        SELECT MIN(p.score) AS score FROM coop_entries AS p
        WHERE p.profile_number = r.profile_number AND p.map_id = r.map_id AND p.category_id = r.category_id
          AND p.id <> r.id AND p.score > r.score AND p.verified AND NOT p.banned AND p.mirror_of IS NULL
          AND (r.timestamp IS NULL OR p.timestamp < r.timestamp)
    ) AS prev ON true
WHERE r.post_rank IS NOT NULL AND r.mirror_of IS NULL;

-- The counts use each run as it is now, but the old board ranked runs as they were then (runs
-- since banned or unbanned, added later with an earlier date). Where that shows, its ranks win:
-- a world record there stays one and nothing else becomes one (so WR history and counts don't
-- change), and no run ranks lower than it did there (one place per co-op run can't rank lower
-- than one per player).
CREATE FUNCTION pg_temp.kept(counted int, old int) RETURNS int LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN counted IS NULL OR old IS NULL THEN COALESCE(counted, old)
                WHEN old = 1 THEN 1
                ELSE GREATEST(2, LEAST(counted, old)) END
$$;
CREATE TEMP TABLE reranked ON COMMIT DROP AS
SELECT id, old_post, old_pre, pg_temp.kept(counted_post, old_post) AS new_post, pg_temp.kept(counted_pre, old_pre) AS new_pre
FROM counted;

\echo
\echo 'Co-op runs with ranks, and how many would change:'
SELECT COUNT(*) AS runs,
       COUNT(*) FILTER (WHERE new_post IS DISTINCT FROM old_post) AS post_rank_changes,
       COUNT(*) FILTER (WHERE new_pre IS DISTINCT FROM old_pre) AS pre_rank_changes,
       COUNT(*) FILTER (WHERE new_post > old_post) AS ranked_lower_than_before,
       COUNT(*) FILTER (WHERE (new_post = 1) <> (old_post = 1)) AS world_records_changed
FROM reranked;
\echo 'The latest changes (old -> new):'
SELECT cl.id, cl.timestamp, m.name AS map, COALESCE(u.board_name, u.steam_name) AS player, cl.score,
       COALESCE(r.old_pre::text, '-') || ' -> ' || COALESCE(r.old_post::text, '-') AS old,
       COALESCE(r.new_pre::text, '-') || ' -> ' || COALESCE(r.new_post::text, '-') AS new
FROM reranked AS r
    JOIN changelog AS cl ON cl.id = r.id
    JOIN maps AS m ON m.steam_id = cl.map_id
    JOIN users AS u ON u.profile_number = cl.profile_number
WHERE r.new_post IS DISTINCT FROM r.old_post OR r.new_pre IS DISTINCT FROM r.old_pre
ORDER BY cl.timestamp DESC NULLS LAST
LIMIT 15;

UPDATE changelog AS cl SET post_rank = r.new_post, pre_rank = r.new_pre
FROM reranked AS r
WHERE cl.id = r.id AND (r.new_post IS DISTINCT FROM r.old_post OR r.new_pre IS DISTINCT FROM r.old_pre);

\if :{?apply}
COMMIT;
\echo 'Applied.'
\else
ROLLBACK;
\echo 'Dry run: nothing changed. Run again with -v apply=1 to apply.'
\endif
