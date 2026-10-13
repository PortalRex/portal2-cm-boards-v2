-- SAR mtrigger segments per run, imported from autorender (import_autorender.py) so the
-- boards don't have to query autorender for them. Apply to databases created from an
-- older schema.sql.

ALTER TABLE changelog ADD COLUMN IF NOT EXISTS segments jsonb;
