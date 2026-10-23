-- Discord announcements of new world records, one webhook per game (seasons have their own). See
-- server/src/tools/wr_webhooks.rs.

-- The game's Discord webhook for its WRs (admins set it in the games editor); NULL posts nothing.
ALTER TABLE games ADD COLUMN IF NOT EXISTS wr_webhook_url character varying(300);

-- Runs the announcer has checked, so each is announced at most once (posted: it was a WR and was sent).
CREATE TABLE IF NOT EXISTS wr_announcements (
    changelog_id bigint PRIMARY KEY REFERENCES changelog(id) ON DELETE CASCADE,
    posted boolean NOT NULL,
    checked_at timestamp without time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);

-- The announcer only looks at runs after this one: the newest run when announcing was set up, so
-- no old WR is ever posted.
CREATE TABLE IF NOT EXISTS wr_announcer_state (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    after_id bigint NOT NULL
);
INSERT INTO wr_announcer_state (after_id) SELECT COALESCE(max(id), 0) FROM changelog ON CONFLICT DO NOTHING;
