-- Removes chapters without maps that the Mel import created (the Mel board's empty Advanced
-- "1952" chapter, imported as a second Story chapter). Apply to databases created from an
-- older schema.sql; the importer now skips them.
DELETE FROM chapters AS c
WHERE c.game_id = 2 AND NOT EXISTS (SELECT 1 FROM maps AS m WHERE m.chapter_id = c.id);
