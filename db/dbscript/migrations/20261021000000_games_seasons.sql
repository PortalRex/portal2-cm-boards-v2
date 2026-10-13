-- Games, seasons, linked leaderboards and the admin catalog editor. Apply to databases created
-- from an older schema.sql.
--
-- Two maps (leaderboards) can be linked (map_links). A run set on one is also evaluated for
-- the other: if it beats the player's best there, it's recorded there too (a mirror row,
-- changelog.mirror_of). Linking doesn't copy existing times; only runs set after the link.
-- Links to a season's maps only apply inside the season's dates. Triggers create the mirrors
-- and keep them in step with the original (bans, verification, demos, deletion and co-op
-- pairing), so every board query works for linked boards unchanged.
--
-- A season is a game whose maps are copies of a base game's maps (maps.source_map), normally
-- linked to them.

-- Lookups by map, player and pairing (the changelog had none, so per-map queries scanned it all).
CREATE INDEX IF NOT EXISTS idx_changelog_map_score ON changelog (map_id, score);
CREATE INDEX IF NOT EXISTS idx_changelog_profile ON changelog (profile_number);
CREATE INDEX IF NOT EXISTS idx_changelog_coop ON changelog (coop_id) WHERE coop_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_changelog_timestamp ON changelog (timestamp);
CREATE INDEX IF NOT EXISTS idx_coop_bundled_cl1 ON coop_bundled (cl_id1);
CREATE INDEX IF NOT EXISTS idx_coop_bundled_cl2 ON coop_bundled (cl_id2);

-- Season copies need longer map ids than Steam leaderboard ids ("s3-47458").
ALTER TABLE maps ALTER COLUMN steam_id TYPE character varying(32);
ALTER TABLE changelog ALTER COLUMN map_id TYPE character varying(32);
ALTER TABLE categories ALTER COLUMN map_id TYPE character varying(32);
ALTER TABLE mtriggers ALTER COLUMN map_id TYPE character varying(32);

ALTER TABLE games ADD COLUMN IF NOT EXISTS slug character varying(32);
ALTER TABLE games ADD COLUMN IF NOT EXISTS kind character varying(10) NOT NULL DEFAULT 'game' CHECK (kind IN ('game', 'season'));
ALTER TABLE games ADD COLUMN IF NOT EXISTS base_game_id integer REFERENCES games(id);
ALTER TABLE games ADD COLUMN IF NOT EXISTS starts_at timestamp without time zone;
ALTER TABLE games ADD COLUMN IF NOT EXISTS ends_at timestamp without time zone;
ALTER TABLE games ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE games ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
UPDATE games SET slug = 'portal2', sort_order = 1 WHERE id = 1 AND slug IS NULL;
UPDATE games SET slug = 'mel', sort_order = 2 WHERE id = 2 AND slug IS NULL;
UPDATE games SET slug = 'game-' || id WHERE slug IS NULL;
ALTER TABLE games ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS unq_games_slug ON games (slug);
ALTER TABLE games ALTER COLUMN game_name TYPE character varying(80);

ALTER TABLE chapters ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
UPDATE chapters SET sort_order = id WHERE sort_order = 0;

ALTER TABLE maps ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS source_map character varying(32) REFERENCES maps(steam_id);
UPDATE maps SET sort_order = id WHERE sort_order = 0;
CREATE INDEX IF NOT EXISTS idx_maps_source_map ON maps (source_map) WHERE source_map IS NOT NULL;

ALTER TABLE changelog ADD COLUMN IF NOT EXISTS mirror_of bigint REFERENCES changelog(id);
CREATE INDEX IF NOT EXISTS idx_changelog_mirror_of ON changelog (mirror_of) WHERE mirror_of IS NOT NULL;
ALTER TABLE coop_bundled ADD COLUMN IF NOT EXISTS mirror_of bigint REFERENCES coop_bundled(id);
CREATE INDEX IF NOT EXISTS idx_coop_bundled_mirror_of ON coop_bundled (mirror_of) WHERE mirror_of IS NOT NULL;

-- Rank a time would have on a map: 1 + players whose best (verified, unbanned) is faster.
CREATE OR REPLACE FUNCTION season_rank(p_map character varying, p_score integer, p_player character varying) RETURNS integer AS $$
    SELECT 1 + COUNT(DISTINCT x.profile_number)::integer
    FROM changelog AS x JOIN users AS u ON u.profile_number = x.profile_number
    WHERE x.map_id = p_map AND x.score < p_score AND x.verified AND NOT x.banned AND NOT u.banned
      AND x.profile_number <> p_player AND x.profile_number <> 'N/A';
$$ LANGUAGE sql STABLE;

CREATE TABLE IF NOT EXISTS map_links (
    map_a character varying(32) NOT NULL REFERENCES maps(steam_id) ON DELETE CASCADE,
    map_b character varying(32) NOT NULL REFERENCES maps(steam_id) ON DELETE CASCADE,
    created_at timestamp without time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
    PRIMARY KEY (map_a, map_b),
    CHECK (map_a < map_b)
);
CREATE INDEX IF NOT EXISTS idx_map_links_b ON map_links (map_b);

-- The maps linked to a map, with the time from which the link applies, as of a moment:
-- links to a season's map only inside the season's dates.
CREATE OR REPLACE FUNCTION linked_maps(p_map character varying, p_at timestamp without time zone)
RETURNS TABLE (steam_id character varying, default_cat_id integer) AS $$
    SELECT m.steam_id, m.default_cat_id
    FROM map_links AS l
        JOIN maps AS m ON m.steam_id = CASE WHEN l.map_a = p_map THEN l.map_b ELSE l.map_a END
        JOIN chapters AS c ON c.id = m.chapter_id
        JOIN games AS g ON g.id = c.game_id
    WHERE (l.map_a = p_map OR l.map_b = p_map)
      AND p_at >= l.created_at
      AND (g.kind <> 'season' OR (p_at >= g.starts_at AND (g.ends_at IS NULL OR p_at < g.ends_at)))
      AND m.default_cat_id IS NOT NULL;
$$ LANGUAGE sql STABLE;

-- Records an original run on each linked map where it beats the player's best there.
CREATE OR REPLACE FUNCTION link_mirror_run(src_id bigint) RETURNS void AS $$
DECLARE
    src changelog%ROWTYPE;
    cp RECORD;
    prev_id bigint;
    prev_score integer;
BEGIN
    SELECT * INTO src FROM changelog WHERE id = src_id;
    IF NOT FOUND OR src.mirror_of IS NOT NULL OR src.profile_number = 'N/A' OR src.banned THEN
        RETURN;
    END IF;
    -- Only main-category runs carry over.
    IF src.category_id IS DISTINCT FROM (SELECT default_cat_id FROM maps WHERE steam_id = src.map_id) THEN
        RETURN;
    END IF;
    FOR cp IN SELECT * FROM linked_maps(src.map_id, src.timestamp) LOOP
        CONTINUE WHEN EXISTS (SELECT 1 FROM changelog AS x WHERE x.mirror_of = src.id AND x.map_id = cp.steam_id);
        prev_id := NULL;
        prev_score := NULL;
        SELECT x.id, x.score INTO prev_id, prev_score
        FROM changelog AS x
        WHERE x.map_id = cp.steam_id AND x.profile_number = src.profile_number AND x.verified AND NOT x.banned AND x.category_id = cp.default_cat_id
        ORDER BY x.score, x.timestamp LIMIT 1;
        -- Each board keeps only improvements on the player's best there.
        CONTINUE WHEN prev_id IS NOT NULL AND src.score >= prev_score;
        INSERT INTO changelog (timestamp, profile_number, score, map_id, demo_id, banned, youtube_id, previous_id,
            post_rank, pre_rank, submission, note, category_id, score_delta, verified, admin_note, autorender_id,
            segments, wr_hidden, mirror_of)
        VALUES (src.timestamp, src.profile_number, src.score, cp.steam_id, src.demo_id, src.banned, src.youtube_id, prev_id,
            season_rank(cp.steam_id, src.score, src.profile_number),
            CASE WHEN prev_id IS NULL THEN NULL ELSE season_rank(cp.steam_id, prev_score, src.profile_number) END,
            src.submission, src.note, cp.default_cat_id,
            CASE WHEN prev_id IS NULL THEN NULL ELSE src.score - prev_score END,
            src.verified, src.admin_note, src.autorender_id, src.segments, COALESCE(src.wr_hidden, false), src.id);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS season_mirror_run(bigint);
DROP FUNCTION IF EXISTS season_backfill(integer);

-- Mirrors an original co-op pairing onto each linked map where either half is mirrored.
CREATE OR REPLACE FUNCTION season_mirror_bundle(bundle_id bigint) RETURNS void AS $$
DECLARE
    b coop_bundled%ROWTYPE;
    copy_map character varying;
    c1 bigint;
    c2 bigint;
    filler bigint;
    mb bigint;
BEGIN
    SELECT * INTO b FROM coop_bundled WHERE id = bundle_id;
    IF NOT FOUND OR b.mirror_of IS NOT NULL THEN
        RETURN;
    END IF;
    FOR copy_map IN
        SELECT DISTINCT x.map_id FROM changelog AS x WHERE x.mirror_of IN (b.cl_id1, b.cl_id2)
    LOOP
        SELECT id INTO filler FROM changelog WHERE profile_number = 'N/A' AND map_id = copy_map ORDER BY id LIMIT 1;
        SELECT id INTO c1 FROM changelog WHERE mirror_of = b.cl_id1 AND map_id = copy_map;
        SELECT id INTO c2 FROM changelog WHERE mirror_of = b.cl_id2 AND map_id = copy_map;
        c1 := COALESCE(c1, filler);
        c2 := COALESCE(c2, filler);
        CONTINUE WHEN c1 IS NULL OR c2 IS NULL;
        SELECT mbx.id INTO mb FROM coop_bundled AS mbx JOIN changelog AS x ON x.id = mbx.cl_id1
        WHERE mbx.mirror_of = b.id AND x.map_id = copy_map;
        IF mb IS NULL THEN
            INSERT INTO coop_bundled (p_id1, p_id2, p1_is_host, cl_id1, cl_id2, mirror_of)
            VALUES (b.p_id1, b.p_id2, b.p1_is_host, c1, c2, b.id) RETURNING id INTO mb;
        ELSE
            UPDATE coop_bundled SET p_id1 = b.p_id1, p_id2 = b.p_id2, p1_is_host = b.p1_is_host, cl_id1 = c1, cl_id2 = c2 WHERE id = mb;
        END IF;
        UPDATE changelog SET coop_id = NULL WHERE coop_id = mb AND id NOT IN (c1, c2);
        UPDATE changelog SET coop_id = mb WHERE id IN (c1, c2) AND profile_number <> 'N/A';
        mb := NULL;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Drops the mirrored runs on a game's maps (before deleting it).
CREATE OR REPLACE FUNCTION season_clear(p_game integer) RETURNS void AS $$
BEGIN
    CREATE TEMP TABLE IF NOT EXISTS season_clear_ids (id bigint) ON COMMIT DROP;
    DELETE FROM season_clear_ids;
    INSERT INTO season_clear_ids
        SELECT x.id FROM changelog AS x JOIN maps AS m ON m.steam_id = x.map_id JOIN chapters AS c ON c.id = m.chapter_id
        WHERE c.game_id = p_game AND x.mirror_of IS NOT NULL;
    UPDATE changelog SET coop_id = NULL WHERE id IN (SELECT id FROM season_clear_ids);
    DELETE FROM coop_bundled WHERE cl_id1 IN (SELECT id FROM season_clear_ids) OR cl_id2 IN (SELECT id FROM season_clear_ids);
    UPDATE changelog SET previous_id = NULL WHERE previous_id IN (SELECT id FROM season_clear_ids);
    DELETE FROM changelog WHERE id IN (SELECT id FROM season_clear_ids);
END;
$$ LANGUAGE plpgsql;

-- Triggers keeping mirrors in step with the originals.
CREATE OR REPLACE FUNCTION season_changelog_insert() RETURNS trigger AS $$
BEGIN
    IF NEW.mirror_of IS NULL AND NEW.profile_number <> 'N/A'
       AND EXISTS (SELECT 1 FROM map_links WHERE map_a = NEW.map_id OR map_b = NEW.map_id) THEN
        PERFORM link_mirror_run(NEW.id);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION season_changelog_update() RETURNS trigger AS $$
BEGIN
    IF NEW.mirror_of IS NULL THEN
        UPDATE changelog SET timestamp = NEW.timestamp, profile_number = NEW.profile_number, score = NEW.score,
            banned = NEW.banned, verified = NEW.verified, demo_id = NEW.demo_id, youtube_id = NEW.youtube_id,
            note = NEW.note, admin_note = NEW.admin_note, autorender_id = NEW.autorender_id, segments = NEW.segments,
            wr_hidden = COALESCE(NEW.wr_hidden, false), submission = NEW.submission
        WHERE mirror_of = NEW.id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION season_changelog_delete() RETURNS trigger AS $$
BEGIN
    IF OLD.mirror_of IS NULL AND EXISTS (SELECT 1 FROM changelog WHERE mirror_of = OLD.id) THEN
        UPDATE changelog SET coop_id = NULL
        WHERE coop_id IN (SELECT cb.id FROM coop_bundled AS cb JOIN changelog AS x ON x.id IN (cb.cl_id1, cb.cl_id2) WHERE x.mirror_of = OLD.id);
        DELETE FROM coop_bundled WHERE cl_id1 IN (SELECT id FROM changelog WHERE mirror_of = OLD.id)
            OR cl_id2 IN (SELECT id FROM changelog WHERE mirror_of = OLD.id);
        UPDATE changelog SET previous_id = NULL WHERE previous_id IN (SELECT id FROM changelog WHERE mirror_of = OLD.id);
        DELETE FROM mtrigger_entries WHERE changelog_id IN (SELECT id FROM changelog WHERE mirror_of = OLD.id);
        DELETE FROM changelog WHERE mirror_of = OLD.id;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION season_bundle_upsert() RETURNS trigger AS $$
BEGIN
    IF NEW.mirror_of IS NULL THEN
        PERFORM season_mirror_bundle(NEW.id);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION season_bundle_delete() RETURNS trigger AS $$
BEGIN
    IF OLD.mirror_of IS NULL THEN
        UPDATE changelog SET coop_id = NULL WHERE coop_id IN (SELECT id FROM coop_bundled WHERE mirror_of = OLD.id);
        DELETE FROM coop_bundled WHERE mirror_of = OLD.id;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS season_changelog_insert ON changelog;
CREATE TRIGGER season_changelog_insert AFTER INSERT ON changelog FOR EACH ROW EXECUTE FUNCTION season_changelog_insert();
DROP TRIGGER IF EXISTS season_changelog_update ON changelog;
CREATE TRIGGER season_changelog_update AFTER UPDATE ON changelog FOR EACH ROW
    WHEN (OLD.mirror_of IS NULL AND (OLD.timestamp, OLD.profile_number, OLD.score, OLD.banned, OLD.verified, OLD.demo_id, OLD.youtube_id,
          OLD.note, OLD.admin_note, OLD.autorender_id, OLD.wr_hidden, OLD.submission)
      IS DISTINCT FROM (NEW.timestamp, NEW.profile_number, NEW.score, NEW.banned, NEW.verified, NEW.demo_id, NEW.youtube_id,
          NEW.note, NEW.admin_note, NEW.autorender_id, NEW.wr_hidden, NEW.submission) OR OLD.segments IS DISTINCT FROM NEW.segments)
    EXECUTE FUNCTION season_changelog_update();
DROP TRIGGER IF EXISTS season_changelog_delete ON changelog;
CREATE TRIGGER season_changelog_delete BEFORE DELETE ON changelog FOR EACH ROW EXECUTE FUNCTION season_changelog_delete();
DROP TRIGGER IF EXISTS season_bundle_upsert ON coop_bundled;
CREATE TRIGGER season_bundle_upsert AFTER INSERT OR UPDATE OF p_id1, p_id2, p1_is_host, cl_id1, cl_id2 ON coop_bundled FOR EACH ROW EXECUTE FUNCTION season_bundle_upsert();
DROP TRIGGER IF EXISTS season_bundle_delete ON coop_bundled;
CREATE TRIGGER season_bundle_delete BEFORE DELETE ON coop_bundled FOR EACH ROW EXECUTE FUNCTION season_bundle_delete();
