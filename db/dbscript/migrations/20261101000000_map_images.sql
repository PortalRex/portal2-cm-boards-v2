-- Uploaded map images (server/src/api/v1/handlers/catalog.rs): the file in IMAGES.STORAGE, and
-- when it was set (part of the image's address, so browsers fetch a new one when it changes).
-- Maps without one use the site's built-in image, if any.
ALTER TABLE maps ADD COLUMN IF NOT EXISTS image_file character varying(200);
ALTER TABLE maps ADD COLUMN IF NOT EXISTS image_updated timestamp without time zone;
