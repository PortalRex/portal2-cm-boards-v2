-- Every reaction change (up, down, or cleared), kept even when the reaction is changed or
-- removed, so staff can see who reacted and how it changed. Apply to databases created
-- from an older schema.sql.
CREATE TABLE IF NOT EXISTS run_reaction_events (
    id bigserial PRIMARY KEY,
    changelog_id bigint NOT NULL REFERENCES changelog(id) ON DELETE CASCADE,
    profile_number character varying(50) NOT NULL REFERENCES users(profile_number) ON DELETE CASCADE,
    -- 1 up, -1 down, NULL cleared.
    reaction smallint CHECK (reaction IN (-1, 1)),
    created_at timestamp without time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS run_reaction_events_run ON run_reaction_events (changelog_id, created_at DESC);
