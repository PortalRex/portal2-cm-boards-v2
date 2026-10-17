-- Each game's header branding, set in the games editor. Apply to databases created from an older schema.sql.
--
-- short_name: the name beside the logo (e.g. P2CM, PSM:CM); NULL = the site's default. The logo and
-- background are uploaded files in IMAGES.STORAGE (like map images), with when they were set (part
-- of their address, so browsers fetch a new one when it changes); NULL = the site's built-in ones.
ALTER TABLE games ADD COLUMN IF NOT EXISTS short_name character varying(16);
ALTER TABLE games ADD COLUMN IF NOT EXISTS logo_file character varying(200);
ALTER TABLE games ADD COLUMN IF NOT EXISTS logo_updated timestamp without time zone;
ALTER TABLE games ADD COLUMN IF NOT EXISTS background_file character varying(200);
ALTER TABLE games ADD COLUMN IF NOT EXISTS background_updated timestamp without time zone;
