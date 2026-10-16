-- World record history: the changelog is read with post_rank = 1 (verified, not banned, not
-- hidden), newest first, on every map page. Without this it's a scan of the whole table.
CREATE INDEX IF NOT EXISTS idx_changelog_wr ON changelog (timestamp DESC NULLS LAST)
    WHERE post_rank = 1 AND verified IS TRUE AND banned = false AND wr_hidden = false;
