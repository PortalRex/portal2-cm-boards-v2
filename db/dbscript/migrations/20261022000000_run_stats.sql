-- Per-run stats read from demos. Apply to databases created from an older schema.sql.
--
-- portals: portals placed in the run, from the challenge mode scoreboard the game sends at the
-- end of a run (stored for submitted demos; db/dbscript/import_demo_stats.py fills it in for the
-- archived board demos). Linked copies of a run (see 20261021000000_games_seasons.sql) carry it too.

ALTER TABLE changelog ADD COLUMN IF NOT EXISTS portals smallint;

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
            segments, wr_hidden, mirror_of, portals)
        VALUES (src.timestamp, src.profile_number, src.score, cp.steam_id, src.demo_id, src.banned, src.youtube_id, prev_id,
            season_rank(cp.steam_id, src.score, src.profile_number),
            CASE WHEN prev_id IS NULL THEN NULL ELSE season_rank(cp.steam_id, prev_score, src.profile_number) END,
            src.submission, src.note, cp.default_cat_id,
            CASE WHEN prev_id IS NULL THEN NULL ELSE src.score - prev_score END,
            src.verified, src.admin_note, src.autorender_id, src.segments, COALESCE(src.wr_hidden, false), src.id, src.portals);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION season_changelog_update() RETURNS trigger AS $$
BEGIN
    IF NEW.mirror_of IS NULL THEN
        UPDATE changelog SET timestamp = NEW.timestamp, profile_number = NEW.profile_number, score = NEW.score,
            banned = NEW.banned, verified = NEW.verified, demo_id = NEW.demo_id, youtube_id = NEW.youtube_id,
            note = NEW.note, admin_note = NEW.admin_note, autorender_id = NEW.autorender_id, segments = NEW.segments,
            wr_hidden = COALESCE(NEW.wr_hidden, false), submission = NEW.submission, portals = NEW.portals
        WHERE mirror_of = NEW.id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS season_changelog_update ON changelog;
CREATE TRIGGER season_changelog_update AFTER UPDATE ON changelog FOR EACH ROW
    WHEN (OLD.mirror_of IS NULL AND (OLD.timestamp, OLD.profile_number, OLD.score, OLD.banned, OLD.verified, OLD.demo_id, OLD.youtube_id,
          OLD.note, OLD.admin_note, OLD.autorender_id, OLD.wr_hidden, OLD.submission)
      IS DISTINCT FROM (NEW.timestamp, NEW.profile_number, NEW.score, NEW.banned, NEW.verified, NEW.demo_id, NEW.youtube_id,
          NEW.note, NEW.admin_note, NEW.autorender_id, NEW.wr_hidden, NEW.submission) OR OLD.segments IS DISTINCT FROM NEW.segments OR OLD.portals IS DISTINCT FROM NEW.portals)
    EXECUTE FUNCTION season_changelog_update();
