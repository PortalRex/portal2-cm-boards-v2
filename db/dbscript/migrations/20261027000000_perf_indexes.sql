-- Player search matches names with ILIKE '%text%'; a trigram index serves that directly instead
-- of scanning every user.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_users_name_trgm
    ON users USING gin (COALESCE(board_name, steam_name) gin_trgm_ops);
