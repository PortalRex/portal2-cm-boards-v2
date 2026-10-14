-- State of the Steam leaderboard sync, per map. A map's first pass is a baseline: Steam's
-- leaderboards carry no dates, so times found then are recorded undated rather than as new runs.
-- Later passes only see changes since the previous one, which are new runs.
CREATE TABLE IF NOT EXISTS steam_sync_maps (
    map_id character varying PRIMARY KEY REFERENCES maps(steam_id),
    baseline_done boolean NOT NULL DEFAULT false,
    last_hash bigint,
    last_pass timestamp without time zone
);
