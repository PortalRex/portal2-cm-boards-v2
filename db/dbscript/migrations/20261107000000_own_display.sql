-- Players choose their own name and picture (Settings). Apply to databases created from an older schema.sql.
--
-- A name of their own goes in users.board_name like before; a picture of their own is marked here
-- so Steam sign-ins and avatar refreshes keep it (staff-set ones use users.avatar_locked).
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_custom boolean NOT NULL DEFAULT false;
