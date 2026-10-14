-- State of the Steam leaderboard sync. A map's first pass only records what Steam shows (the
-- baseline): times the board doesn't have by then are never pulled in (Steam has no dates, and
-- the old board leaves some Steam times out on purpose). After that, only entries that change on
-- Steam between passes are considered as new runs.
CREATE TABLE IF NOT EXISTS steam_sync_maps (
    map_id character varying PRIMARY KEY REFERENCES maps(steam_id),
    last_hash bigint,
    last_pass timestamp without time zone
);

-- The leaderboard entries seen on the last pass (each player's score), to spot changes.
CREATE TABLE IF NOT EXISTS steam_sync_entries (
    map_id character varying NOT NULL REFERENCES maps(steam_id) ON DELETE CASCADE,
    profile_number character varying NOT NULL,
    score integer NOT NULL,
    PRIMARY KEY (map_id, profile_number)
);
