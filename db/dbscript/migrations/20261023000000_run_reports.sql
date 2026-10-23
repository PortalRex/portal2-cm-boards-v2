-- Anonymous run reports. Apply to databases created from an older schema.sql.
--
-- Anyone can report a run; staff see the report but not who sent it. reporter_key is a salted
-- hash of the reporter (account or address), used only to stop duplicate reports and spam.
CREATE TABLE IF NOT EXISTS run_reports (
    id bigserial PRIMARY KEY,
    changelog_id bigint NOT NULL REFERENCES changelog(id) ON DELETE CASCADE,
    reason character varying(20) NOT NULL CHECK (reason IN ('cheating', 'wrong_time', 'wrong_player', 'bad_proof', 'other')),
    details character varying(1000),
    reporter_key character varying(64) NOT NULL,
    status character varying(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
    resolved_by character varying(50) REFERENCES users(profile_number),
    resolved_at timestamp without time zone,
    resolution_note character varying(500),
    created_at timestamp without time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);
CREATE INDEX IF NOT EXISTS idx_run_reports_status ON run_reports (status, id DESC);
CREATE INDEX IF NOT EXISTS idx_run_reports_reporter ON run_reports (reporter_key, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS unq_run_reports_open ON run_reports (changelog_id, reporter_key) WHERE status = 'open';
