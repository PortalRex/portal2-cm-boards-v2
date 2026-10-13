-- Full-game (speedrun.com-style) leaderboards. Same model as PortalRex/fullgame-boards
-- (docs/fullgame/PLAN.md there): games, categories, levels, variables, runners and runs,
-- kept apart from the Challenge Mode tables. Apply to databases created from an older
-- schema.sql (new databases get these from schema.sql directly).

CREATE TABLE IF NOT EXISTS fg_games (
    id serial PRIMARY KEY,
    slug character varying(50) NOT NULL UNIQUE,
    name character varying(100) NOT NULL,
    src_id character varying(20) UNIQUE,
    sort integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS fg_categories (
    id serial PRIMARY KEY,
    game_id integer NOT NULL REFERENCES fg_games(id) ON DELETE CASCADE,
    slug character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    type character varying(10) DEFAULT 'full_game' NOT NULL CHECK (type IN ('full_game', 'per_level')),
    players smallint DEFAULT 1 NOT NULL,
    rules text,
    -- Demos required through this rank; NULL = always.
    demo_rank integer,
    video_required boolean DEFAULT false NOT NULL,
    miscellaneous boolean DEFAULT false NOT NULL,
    src_id character varying(20) UNIQUE,
    sort integer DEFAULT 0 NOT NULL,
    UNIQUE (game_id, slug)
);

CREATE TABLE IF NOT EXISTS fg_levels (
    id serial PRIMARY KEY,
    game_id integer NOT NULL REFERENCES fg_games(id) ON DELETE CASCADE,
    slug character varying(80) NOT NULL,
    name character varying(150) NOT NULL,
    src_id character varying(20) UNIQUE,
    sort integer DEFAULT 0 NOT NULL,
    UNIQUE (game_id, slug)
);

-- SRC-style variables. Subcategory variables split a leaderboard (e.g. SLA / No SLA);
-- the others are run attributes (e.g. Quicksaves).
CREATE TABLE IF NOT EXISTS fg_variables (
    id serial PRIMARY KEY,
    game_id integer NOT NULL REFERENCES fg_games(id) ON DELETE CASCADE,
    -- NULL = every category of the game.
    category_id integer REFERENCES fg_categories(id) ON DELETE CASCADE,
    -- Only for scope = single_level.
    level_id integer REFERENCES fg_levels(id) ON DELETE CASCADE,
    name character varying(100) NOT NULL,
    scope character varying(20) DEFAULT 'global' NOT NULL CHECK (scope IN ('global', 'full_game', 'all_levels', 'single_level')),
    is_subcategory boolean DEFAULT false NOT NULL,
    mandatory boolean DEFAULT false NOT NULL,
    src_id character varying(20) UNIQUE,
    sort integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS fg_variable_values (
    id serial PRIMARY KEY,
    variable_id integer NOT NULL REFERENCES fg_variables(id) ON DELETE CASCADE,
    label character varying(100) NOT NULL,
    slug character varying(80) NOT NULL,
    src_id character varying(20),
    sort integer DEFAULT 0 NOT NULL,
    UNIQUE (variable_id, slug),
    UNIQUE (variable_id, src_id)
);

-- A runner: a board user (Steam profile_number) or an imported SRC user/guest that can be claimed later.
CREATE TABLE IF NOT EXISTS fg_runners (
    id serial PRIMARY KEY,
    profile_number character varying(50) UNIQUE,
    src_user_id character varying(20) UNIQUE,
    src_guest_name character varying(100) UNIQUE,
    name character varying(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS fg_runs (
    id serial PRIMARY KEY,
    category_id integer NOT NULL REFERENCES fg_categories(id),
    level_id integer REFERENCES fg_levels(id),
    time_ms integer NOT NULL,
    run_date date,
    submitted_at timestamp(6) without time zone DEFAULT now() NOT NULL,
    -- Steam id of the submitter.
    submitted_by character varying(50),
    status character varying(10) DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'verified', 'rejected')),
    -- Steam id of the moderator, or the SRC examiner's name for imported runs.
    examiner character varying(50),
    examiner_name character varying(100),
    examined_at timestamp(6) without time zone,
    reject_reason character varying(500),
    comment text,
    video_url character varying(500),
    demo_url character varying(500),
    -- Uploaded demo archive, relative to the demo folder.
    demo_file character varying(255),
    demo_file_bytes bigint,
    src_id character varying(20) UNIQUE
);
CREATE INDEX IF NOT EXISTS ix_fg_runs_board ON fg_runs (category_id, level_id, status, time_ms);
CREATE INDEX IF NOT EXISTS ix_fg_runs_status ON fg_runs (status, submitted_at);

CREATE TABLE IF NOT EXISTS fg_run_runners (
    run_id integer NOT NULL REFERENCES fg_runs(id) ON DELETE CASCADE,
    runner_id integer NOT NULL REFERENCES fg_runners(id),
    position smallint DEFAULT 0 NOT NULL,
    PRIMARY KEY (run_id, runner_id)
);
CREATE INDEX IF NOT EXISTS ix_fg_run_runners_runner ON fg_run_runners (runner_id);

CREATE TABLE IF NOT EXISTS fg_run_values (
    run_id integer NOT NULL REFERENCES fg_runs(id) ON DELETE CASCADE,
    variable_id integer NOT NULL REFERENCES fg_variables(id),
    value_id integer NOT NULL REFERENCES fg_variable_values(id),
    PRIMARY KEY (run_id, variable_id)
);

-- Moderators: game-wide (category_id NULL) or one category.
CREATE TABLE IF NOT EXISTS fg_moderators (
    id serial PRIMARY KEY,
    profile_number character varying(50) NOT NULL,
    game_id integer NOT NULL REFERENCES fg_games(id) ON DELETE CASCADE,
    category_id integer REFERENCES fg_categories(id) ON DELETE CASCADE,
    UNIQUE (profile_number, game_id, category_id)
);

CREATE TABLE IF NOT EXISTS fg_run_events (
    id serial PRIMARY KEY,
    run_id integer NOT NULL REFERENCES fg_runs(id) ON DELETE CASCADE,
    action character varying(20) NOT NULL CHECK (action IN ('submitted', 'verified', 'rejected', 'reopened', 'edited', 'imported', 'demo_uploaded', 'resubmitted', 'demo_removed')),
    -- Steam id; NULL = system/import.
    actor character varying(50),
    note text,
    created_at timestamp(6) without time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_fg_run_events_run ON fg_run_events (run_id, created_at);

CREATE TABLE IF NOT EXISTS fg_admin_events (
    id serial PRIMARY KEY,
    game_id integer REFERENCES fg_games(id) ON DELETE SET NULL,
    actor character varying(50) NOT NULL,
    action character varying(50) NOT NULL,
    -- JSON: what changed.
    detail text,
    created_at timestamp(6) without time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_fg_admin_events_game ON fg_admin_events (game_id, created_at);
