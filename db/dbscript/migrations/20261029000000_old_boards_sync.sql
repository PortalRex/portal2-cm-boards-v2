-- The old boards' changelog entries as last pulled (tools/old_boards_sync.rs), to tell what
-- changed there since: only those changes are applied, so edits made here aren't undone.
CREATE TABLE IF NOT EXISTS old_board_runs (
    game_id integer NOT NULL REFERENCES games(id),
    legacy_id bigint NOT NULL,
    banned boolean NOT NULL,
    pending boolean NOT NULL,
    youtube_id character varying(30),
    note character varying(100),
    has_demo boolean NOT NULL,
    autorender_id character varying(11),
    seen_at timestamp without time zone NOT NULL,
    PRIMARY KEY (game_id, legacy_id)
);
