-- Removes the full-game (speedrun.com-style) boards, which this fork no longer has. Apply to
-- databases that got the fg_* tables from the earlier full-game migration; a no-op otherwise.
DROP TABLE IF EXISTS fg_admin_events, fg_run_events, fg_moderators, fg_run_values, fg_run_runners, fg_runs, fg_runners,
    fg_variable_values, fg_variables, fg_levels, fg_categories, fg_games CASCADE;
