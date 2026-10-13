-- Staff-set profile names and pictures. Apply to databases created from an older schema.sql.
--
-- Staff can replace a player's displayed name (users.board_name) and picture; the locks keep
-- Steam sign-ins and avatar refreshes from undoing that until staff reset them.
ALTER TABLE users ADD COLUMN IF NOT EXISTS name_locked boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_locked boolean NOT NULL DEFAULT false;
