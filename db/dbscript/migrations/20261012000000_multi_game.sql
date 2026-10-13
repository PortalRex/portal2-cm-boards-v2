-- Adds what's needed to host Portal Stories: Mel alongside Portal 2 and to keep
-- autorender video IDs from the boards being replaced. Apply to databases created
-- from an older schema.sql (new databases get these from schema.sql directly).

ALTER TABLE changelog ADD COLUMN IF NOT EXISTS autorender_id character varying(11);

ALTER TABLE chapters ADD COLUMN IF NOT EXISTS game_mode character varying(20) DEFAULT 'sp' NOT NULL;
UPDATE chapters SET game_mode = 'coop' WHERE game_id = 1 AND is_multiplayer;

CREATE TABLE IF NOT EXISTS legacy_changelog_ids (
    game_id integer NOT NULL REFERENCES games(id),
    legacy_id bigint NOT NULL,
    changelog_id bigint NOT NULL REFERENCES changelog(id),
    PRIMARY KEY (game_id, legacy_id)
);
