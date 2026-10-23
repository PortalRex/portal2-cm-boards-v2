-- Thumbs up / down on runs. Apply to databases created from an older schema.sql.
-- A co-op run's reactions are stored against the first changelog entry of its pair.
CREATE TABLE IF NOT EXISTS run_reactions (
    changelog_id bigint NOT NULL REFERENCES changelog(id) ON DELETE CASCADE,
    profile_number character varying(50) NOT NULL REFERENCES users(profile_number) ON DELETE CASCADE,
    reaction smallint NOT NULL CHECK (reaction IN (-1, 1)),
    created_at timestamp without time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (changelog_id, profile_number)
);
