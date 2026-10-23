-- A game's own names for its boards ("modes"), by chapter game_mode: {"sp": "No hair"}. Modes
-- without one keep the site's default name (Singleplayer, Cooperative, ...).
ALTER TABLE games ADD COLUMN IF NOT EXISTS mode_names jsonb NOT NULL DEFAULT '{}'::jsonb;
