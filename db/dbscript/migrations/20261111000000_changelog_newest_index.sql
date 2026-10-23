-- Score Updates (and every changelog list) reads the newest runs first: ORDER BY timestamp DESC NULLS LAST
-- (undated imported runs last). idx_changelog_timestamp is in the other order (ASC, nulls last), which can't
-- give that, so each page load sorted the whole table (~180 ms, spilling to disk). This one is in that order,
-- so the newest rows are read straight off it.
CREATE INDEX IF NOT EXISTS idx_changelog_newest ON changelog (timestamp DESC NULLS LAST);
