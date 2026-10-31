-- Comments on runs, edited on the boards (PUT /runs/{id}/comment): players change or clear their
-- own; one staff set or cleared is locked from the player. A comment changed here is the boards'
-- own from then on: the old-board sync no longer fills it from the old board (even when cleared).
BEGIN;

ALTER TABLE changelog ADD COLUMN IF NOT EXISTS note_locked boolean NOT NULL DEFAULT false;
ALTER TABLE changelog ADD COLUMN IF NOT EXISTS note_edited boolean NOT NULL DEFAULT false;

-- Submissions take comments up to 500 characters (as run reports' notes); the column took 100.
-- The season copies' update trigger looks at the column, so it's set again around the change, as
-- 20261022000000_run_stats.sql left it.
DROP TRIGGER IF EXISTS season_changelog_update ON changelog;
ALTER TABLE changelog ALTER COLUMN note TYPE character varying(500);
CREATE TRIGGER season_changelog_update AFTER UPDATE ON changelog FOR EACH ROW
    WHEN (OLD.mirror_of IS NULL AND (OLD.timestamp, OLD.profile_number, OLD.score, OLD.banned, OLD.verified, OLD.demo_id, OLD.youtube_id,
          OLD.note, OLD.admin_note, OLD.autorender_id, OLD.wr_hidden, OLD.submission)
      IS DISTINCT FROM (NEW.timestamp, NEW.profile_number, NEW.score, NEW.banned, NEW.verified, NEW.demo_id, NEW.youtube_id,
          NEW.note, NEW.admin_note, NEW.autorender_id, NEW.wr_hidden, NEW.submission) OR OLD.segments IS DISTINCT FROM NEW.segments OR OLD.portals IS DISTINCT FROM NEW.portals)
    EXECUTE FUNCTION season_changelog_update();

COMMIT;
