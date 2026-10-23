-- What's read from each demo by the demo parsing job (server/src/tools/demo_parse.rs).
-- parsed_at is null until the job has read the demo (new submissions, demos pulled from the old
-- boards, and demos whose file was restored are read again).
ALTER TABLE demos ADD COLUMN IF NOT EXISTS parsed_at timestamp without time zone;
-- The end-of-run scoreboard: time (centiseconds) and portal count; null without a finished run.
ALTER TABLE demos ADD COLUMN IF NOT EXISTS time_score integer;
ALTER TABLE demos ADD COLUMN IF NOT EXISTS portal_score integer;
-- The players in the demo ([{ "steamId", "name" }]) and, for co-op, who hosted (played blue).
ALTER TABLE demos ADD COLUMN IF NOT EXISTS players jsonb;
ALTER TABLE demos ADD COLUMN IF NOT EXISTS host_steam_id character varying(20);
-- The CRC32 of the SAR build that recorded it (as of the release's sar.dll / sar.so); sar_version
-- is what SAR echoed into the demo, or the version another demo with the same build echoed.
ALTER TABLE demos ADD COLUMN IF NOT EXISTS sar_checksum character varying(8);
-- True when the build is on the old boards' list of approved SAR builds; null when unknown.
ALTER TABLE demos ADD COLUMN IF NOT EXISTS sar_approved boolean;
-- SAR's record of pauses and timescale cheats: { "pauseTicks", "timescale": [...] }.
ALTER TABLE demos ADD COLUMN IF NOT EXISTS sar_checks jsonb;
ALTER TABLE demos ADD COLUMN IF NOT EXISTS parse_error character varying(200);

CREATE INDEX IF NOT EXISTS idx_demos_unparsed ON demos (id) WHERE parsed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_demos_sar_checksum ON demos (sar_checksum) WHERE sar_checksum IS NOT NULL;
-- Runs by demo (finding a demo's run).
CREATE INDEX IF NOT EXISTS idx_changelog_demo ON changelog (demo_id) WHERE demo_id IS NOT NULL;
