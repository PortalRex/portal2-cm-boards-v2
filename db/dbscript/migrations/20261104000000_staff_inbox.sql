-- The staff inbox next to the avatar: the newest audit-log entry each staff member has seen, so
-- the badge counts what's new to them.
ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_inbox_seen_id bigint;
