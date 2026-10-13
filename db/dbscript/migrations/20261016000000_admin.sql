-- Admin tools: an audit log of admin actions, and frozen profiles. Apply to databases
-- created from an older schema.sql.

-- Frozen profiles keep their existing times but can't get new ones (a ban that leaves the
-- leaderboards as they were).
ALTER TABLE users ADD COLUMN IF NOT EXISTS frozen boolean DEFAULT false NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS frozen_reason character varying(500);

-- Every change made by an admin (or by the board's own services), newest first.
CREATE TABLE IF NOT EXISTS admin_actions (
    id bigserial PRIMARY KEY,
    -- The admin who acted; NULL when the board's services did (see via_service).
    admin_profile character varying(50) REFERENCES users(profile_number),
    via_service boolean NOT NULL DEFAULT false,
    action character varying(50) NOT NULL,
    target_type character varying(30) NOT NULL,
    target_id character varying(50) NOT NULL,
    reason character varying(500),
    -- Before/after values, or the full row for deletions.
    details jsonb,
    created_at timestamp without time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_actions_created ON admin_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_actions_target ON admin_actions (target_type, target_id);
