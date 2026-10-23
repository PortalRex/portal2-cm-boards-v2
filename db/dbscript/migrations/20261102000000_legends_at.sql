-- When a player's peak points first reached Legends (Portal 2). Legends can't be lost, so it's
-- recorded once (tools/points_history.rs) and profiles show the role without working the peak out.
ALTER TABLE users ADD COLUMN IF NOT EXISTS legends_at timestamp without time zone;
