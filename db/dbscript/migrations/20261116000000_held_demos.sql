-- Demos refused at submission for a reason that may be the demo parser's or the game's rather than
-- the player's (the demo couldn't be read, it has no finished run the parser recognises, or its
-- time isn't the one SAR sent): kept for staff to look at instead of being deleted. Staff accept
-- one (the run is recorded from it, as a submission would have been) or dismiss it (its file is
-- deleted; the row stays as the record). The file is under DEMO.STORAGE/held while pending.
BEGIN;

CREATE TABLE IF NOT EXISTS held_demos (
    id bigserial PRIMARY KEY,
    profile_number character varying(50) NOT NULL REFERENCES users(profile_number) ON DELETE CASCADE,
    -- The board map, when known (from SAR's mapId, or the map the parser read).
    map_id character varying(6),
    -- 'submit' (Submit Run) or 'autosubmit' (SAR).
    source character varying(10) NOT NULL CHECK (source IN ('submit', 'autosubmit')),
    -- The time SAR sent, in centiseconds.
    claimed_score integer,
    -- Why it was refused, as the player was told.
    reason character varying(300) NOT NULL,
    file_name character varying(100) NOT NULL,
    file_sha256 character(64) NOT NULL,
    file_size integer NOT NULL,
    -- What the demo parser read from it (parse_demo.mjs's output), when it could read it.
    parsed jsonb,
    -- Submit Run's comment and video.
    note character varying(500),
    youtube_id character varying(30),
    status character varying(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
    -- The run recorded when it was accepted.
    changelog_id bigint REFERENCES changelog(id) ON DELETE SET NULL,
    reviewed_by character varying(50) REFERENCES users(profile_number),
    reviewed_at timestamp without time zone,
    review_note character varying(500),
    created_at timestamp without time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);
CREATE INDEX IF NOT EXISTS idx_held_demos_status ON held_demos (status, id DESC);
-- The same file is kept once while it waits.
CREATE UNIQUE INDEX IF NOT EXISTS unq_held_demos_pending_file ON held_demos (profile_number, file_sha256) WHERE status = 'pending';

COMMIT;
