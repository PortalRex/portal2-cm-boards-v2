-- Steam sign-in: browser sessions and the OpenID replay guard. Apply to databases created
-- from an older schema.sql.

-- One row per signed-in browser. Only a SHA-256 hash of the session cookie is stored.
CREATE TABLE IF NOT EXISTS sessions (
    token_hash bytea PRIMARY KEY,
    profile_number character varying(50) NOT NULL REFERENCES users(profile_number) ON DELETE CASCADE,
    created_at timestamp without time zone NOT NULL DEFAULT now(),
    last_seen timestamp without time zone NOT NULL DEFAULT now(),
    expires_at timestamp without time zone NOT NULL,
    user_agent character varying(200)
);
CREATE INDEX IF NOT EXISTS sessions_profile_number ON sessions (profile_number);

-- Steam login responses already accepted (openid.response_nonce), so one can't be replayed.
CREATE TABLE IF NOT EXISTS openid_nonces (
    nonce character varying(255) PRIMARY KEY,
    seen_at timestamp without time zone NOT NULL DEFAULT now()
);
