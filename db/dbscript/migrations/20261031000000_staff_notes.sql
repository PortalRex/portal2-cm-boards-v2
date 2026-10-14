-- Notes on runs that only staff see (a thread per run; both halves of a co-op run share one,
-- kept on its first half, as reactions are).
CREATE TABLE IF NOT EXISTS run_staff_notes (
    id bigserial PRIMARY KEY,
    changelog_id bigint NOT NULL REFERENCES changelog(id) ON DELETE CASCADE,
    -- Null for notes written by the board's own services (syncs).
    author character varying(50) REFERENCES users(profile_number),
    body character varying(1000) NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);
CREATE INDEX IF NOT EXISTS idx_run_staff_notes_run ON run_staff_notes (changelog_id, id);
