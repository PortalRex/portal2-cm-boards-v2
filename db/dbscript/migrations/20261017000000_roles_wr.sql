-- Staff roles and WR-history hiding. Apply to databases created from an older schema.sql.

-- Staff tier: verifier, moderator or admin (NULL = not staff). For now every tier can use the
-- staff tools; only admins assign roles. users.admin keeps the old board's listing levels
-- (1 standard, 2 shadow, 3 developer).
ALTER TABLE users ADD COLUMN IF NOT EXISTS role character varying(20)
    CHECK (role IN ('verifier', 'moderator', 'admin'));
UPDATE users SET role = 'admin' WHERE admin > 0 AND role IS NULL;

-- Runs staff removed from a map's world-record history (the run itself is unaffected).
ALTER TABLE changelog ADD COLUMN IF NOT EXISTS wr_hidden boolean DEFAULT false NOT NULL;
