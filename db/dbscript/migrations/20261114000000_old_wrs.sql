-- World records from before the boards' own history (2011-2012, from videos and the old iVerb
-- boards), shown only in a map's WR history: they're no one's run here, so boards, PBs and points
-- don't see them. Filled by db/dbscript/old_wrs.py.
CREATE TABLE IF NOT EXISTS old_wrs (
    id serial PRIMARY KEY,
    map_id character varying(6) NOT NULL,
    score integer NOT NULL,
    set_at timestamp without time zone NOT NULL,
    -- false: only the day is known (or, with date_estimated, only the month).
    time_known boolean NOT NULL DEFAULT true,
    date_estimated boolean NOT NULL DEFAULT false,
    player_name character varying(64) NOT NULL,
    -- The player's account here, when known.
    profile_number character varying(50) REFERENCES users(profile_number),
    note text,
    source text NOT NULL,
    UNIQUE (map_id, score, set_at, player_name)
);
CREATE INDEX IF NOT EXISTS idx_old_wrs_map ON old_wrs (map_id);
