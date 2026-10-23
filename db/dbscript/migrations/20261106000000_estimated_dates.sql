-- Imported runs the old board had no date for get one estimated from the runs around them: the
-- date of the last dated run before them in the same game (runs were added in id order). Marked
-- here so they can be told apart (and put back: SET timestamp = NULL, date_estimated = false).
ALTER TABLE changelog ADD COLUMN IF NOT EXISTS date_estimated boolean NOT NULL DEFAULT false;
