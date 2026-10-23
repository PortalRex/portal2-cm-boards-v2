-- SAR auto-submit keys (/api-v2, server/src/api/v2): a player's key goes in SAR's autosubmit.key, and SAR
-- sends it with every submission. Only its SHA-256 is kept, so a copy of the database doesn't hand out keys;
-- the player sees a key once, when it's made in Settings.
ALTER TABLE users ADD COLUMN IF NOT EXISTS submit_key_hash bytea;
ALTER TABLE users ADD COLUMN IF NOT EXISTS submit_key_created timestamp without time zone;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_submit_key_hash ON users (submit_key_hash) WHERE submit_key_hash IS NOT NULL;

-- The old boards' keys (users.auth_hash, imported) keep working: hashed the same way, then the plaintext
-- copies are cleared.
UPDATE users SET submit_key_hash = sha256(convert_to(auth_hash, 'UTF8'))
WHERE auth_hash ~ '^[A-Za-z0-9]{1,64}$' AND submit_key_hash IS NULL;
UPDATE users SET auth_hash = NULL WHERE auth_hash IS NOT NULL;
