--
-- PostgreSQL database dump
--

-- Dumped from database version 13.4
-- Dumped by pg_dump version 13.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', 'public', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: evidence_requirements; Type: TABLE;
--

CREATE TABLE evidence_requirements (
    id integer NOT NULL,
    rank integer NOT NULL,
    demo boolean,
    video boolean,
    active boolean,
    "timestamp" timestamp(6) without time zone,
    closed_timestamp timestamp(6) without time zone
);

--
-- Name: evidence_requirements_id_seq; Type: SEQUENCE;
--

CREATE SEQUENCE evidence_requirements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: evidence_requirements_id_seq; Type: SEQUENCE OWNED BY;
--

ALTER SEQUENCE evidence_requirements_id_seq OWNED BY evidence_requirements.id;


--
-- Name: categories; Type: TABLE;
--

CREATE TABLE categories (
    id integer NOT NULL,
    name character varying(100) DEFAULT ''::character varying NOT NULL,
    map_id character varying(6) DEFAULT ''::character varying NOT NULL,
    rules_id integer,
    updated timestamp(6) without time zone
);

-- Trigger to update `updated` when a row is updated.
 
CREATE OR REPLACE FUNCTION update_updated_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated = now(); 
   RETURN NEW;
END;
$$ language 'plpgsql';

    CREATE TRIGGER update_categories_updated BEFORE UPDATE
    ON categories FOR EACH ROW EXECUTE PROCEDURE 
    update_updated_column();


--
-- Name: categories_id_seq; Type: SEQUENCE;
--

CREATE SEQUENCE categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: categories_id_seq; Type: SEQUENCE OWNED BY;
--

ALTER SEQUENCE categories_id_seq OWNED BY categories.id;

--
-- Name: category_rules; Type: TABLE;
--

CREATE TABLE category_rules (
    id integer NOT NULL,
    rules character varying(2000),
    external_link character varying(200),
    is_active boolean,
    updated timestamp(6) without time zone
);

    CREATE TRIGGER update_category_rules_updated BEFORE UPDATE
    ON category_rules FOR EACH ROW EXECUTE PROCEDURE 
    update_updated_column();

--
-- Name: category_rules_id_seq; Type: SEQUENCE;
--

CREATE SEQUENCE category_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: category_rules_id_seq; Type: SEQUENCE OWNED BY;
--

ALTER SEQUENCE category_rules_id_seq OWNED BY category_rules.id;

--
-- Name: changelog; Type: TABLE;
--

CREATE TABLE changelog (
    id bigint NOT NULL,
    "timestamp" timestamp(6) without time zone,
    profile_number character varying(50) NOT NULL,
    score integer NOT NULL,
    map_id character varying(6) DEFAULT ''::character varying NOT NULL,
    demo_id bigint,
    banned boolean DEFAULT false NOT NULL,
    youtube_id character varying(30),
    previous_id bigint,
    coop_id bigint,
    post_rank integer,
    pre_rank integer,
    submission integer DEFAULT 0 NOT NULL,
    note character varying(100),
    category_id integer DEFAULT 1 NOT NULL,
    score_delta integer,
    verified boolean,
    admin_note character varying(200),
    updated timestamp(6) without time zone,
    autorender_id character varying(11),
    -- SAR mtrigger segments read from the demo by autorender:
    -- [{"name": ..., "ticks": ..., "splits": [{"name": ..., "ticks": ...}]}]
    segments jsonb,
    -- Removed from the map's world-record history by staff (the run itself is unaffected).
    wr_hidden boolean DEFAULT false NOT NULL
);

-- Trigger to update `updated` when a row is updated.

    CREATE TRIGGER update_changelog_updated BEFORE UPDATE
    ON changelog FOR EACH ROW EXECUTE PROCEDURE 
    update_updated_column();

--
-- Name: changelog_id_seq; Type: SEQUENCE;
--

CREATE SEQUENCE changelog_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: changelog_id_seq; Type: SEQUENCE OWNED BY;
--

ALTER SEQUENCE changelog_id_seq OWNED BY changelog.id;


--
-- Name: chapters; Type: TABLE;
--

CREATE TABLE chapters (
    id integer NOT NULL,
    chapter_name character varying(50),
    is_multiplayer boolean DEFAULT false NOT NULL,
    game_id integer DEFAULT 1 NOT NULL,
    -- Board the chapter belongs to within its game: sp/coop (Portal 2), story/advanced (Mel).
    game_mode character varying(20) DEFAULT 'sp' NOT NULL
);


--
-- Name: chapters_id_seq; Type: SEQUENCE;
--

CREATE SEQUENCE chapters_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chapters_id_seq; Type: SEQUENCE OWNED BY;
--

ALTER SEQUENCE chapters_id_seq OWNED BY chapters.id;


--
-- Name: coop_bundled; Type: TABLE;
--

CREATE TABLE coop_bundled (
    id bigint NOT NULL,
    p_id1 character varying(50) NOT NULL,
    p_id2 character varying(50),
    p1_is_host boolean,
    cl_id1 bigint NOT NULL,
    cl_id2 bigint,
    updated timestamp(6) without time zone
);

-- Trigger to update `updated` when a row is updated.
 
    CREATE TRIGGER update_coop_bundled_updated BEFORE UPDATE
    ON coop_bundled FOR EACH ROW EXECUTE PROCEDURE 
    update_updated_column();

--
-- Name: coop_bundled_id_seq; Type: SEQUENCE;
--

CREATE SEQUENCE coop_bundled_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: coop_bundled_id_seq; Type: SEQUENCE OWNED BY;
--

ALTER SEQUENCE coop_bundled_id_seq OWNED BY coop_bundled.id;


--
-- Name: demos; Type: TABLE;
--

CREATE TABLE demos (
    id bigint NOT NULL,
    file_id character varying(100) NOT NULL,
    partner_name character varying(50),
    parsed_successfully boolean DEFAULT false NOT NULL,
    sar_version character varying(50),
    cl_id bigint NOT NULL,
    updated timestamp(6) without time zone
);


-- Trigger to update `updated` when a row is updated.
 
    CREATE TRIGGER update_demos_updated BEFORE UPDATE
    ON demos FOR EACH ROW EXECUTE PROCEDURE 
    update_updated_column();

--
-- Name: demos_id_seq; Type: SEQUENCE;
--

CREATE SEQUENCE demos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: demos_id_seq; Type: SEQUENCE OWNED BY;
--

ALTER SEQUENCE demos_id_seq OWNED BY demos.id;


--
-- Name: games; Type: TABLE;
--

CREATE TABLE games (
    id integer NOT NULL,
    game_name character varying(50) DEFAULT 'Portal 2'::character varying NOT NULL
);


--
-- Name: games_id_seq; Type: SEQUENCE;
--

CREATE SEQUENCE games_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: games_id_seq; Type: SEQUENCE OWNED BY;
--

ALTER SEQUENCE games_id_seq OWNED BY games.id;


--
-- Name: maps; Type: TABLE;
--

CREATE TABLE maps (
    id integer NOT NULL,
    steam_id character varying(6) DEFAULT ''::character varying NOT NULL,
    lp_id character varying(6) DEFAULT ''::character varying NOT NULL,
    name character varying(50) NOT NULL,
    chapter_id integer,
    default_cat_id integer,
    is_public boolean DEFAULT false NOT NULL
);


--
-- Name: maps_id_seq; Type: SEQUENCE;
--

CREATE SEQUENCE maps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: maps_id_seq; Type: SEQUENCE OWNED BY;
--

ALTER SEQUENCE maps_id_seq OWNED BY maps.id;


-- MTRIGGERS TEST:

--
-- Name: mtriggers; Type: TABLE;
--

CREATE TABLE mtriggers (
    id integer NOT NULL,
    map_id character varying(6) NOT NULL,
    category_id integer NOT NULL,
    name character varying(64),
    description character varying(500)
);

--
-- Name: mtriggers_id_seq; Type: SEQUENCE;
--

CREATE SEQUENCE mtriggers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mtriggers_id_seq; Type: SEQUENCE OWNED BY;
--

ALTER SEQUENCE mtriggers_id_seq OWNED BY mtriggers.id;

--
-- Name: mtriggers; Type: TABLE;
--

CREATE TABLE mtrigger_entries (
    id integer NOT NULL,
    mtrigger_id integer NOT NULL,
    changelog_id bigint NOT NULL,
    "time" integer NOT NULL
);

--
-- Name: mtrigger_entries_id_seq; Type: SEQUENCE;
--

CREATE SEQUENCE mtrigger_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mtrigger_entries_id_seq; Type: SEQUENCE OWNED BY;
--

ALTER SEQUENCE mtrigger_entries_id_seq OWNED BY mtrigger_entries.id;


--
-- Name: countries; Type: TABLE;
--

CREATE TABLE countries (
    id integer NOT NULL,
    iso character varying(2) NOT NULL,
    name character varying(80) NOT NULL,
    nicename character varying(80) NOT NULL,
    iso3 character varying(3) DEFAULT NULL,
    numcode integer DEFAULT NULL,
    phonecode integer NOT NULL
);

--
-- Name: countries_id_seq; Type: SEQUENCE;
--

CREATE SEQUENCE countries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: countries_id_seq; Type: SEQUENCE OWNED BY;
--

ALTER SEQUENCE countries_id_seq OWNED BY countries.id;


--
-- Name: users; Type: TABLE;
--

CREATE TABLE users (
    profile_number character varying(50) DEFAULT ''::character varying NOT NULL,
    board_name character varying(50),
    steam_name character varying(50),
    banned boolean DEFAULT false NOT NULL,
    registered integer DEFAULT 0 NOT NULL,
    avatar character varying(200),
    twitch character varying(100),
    youtube character varying(100),
    title character varying(200),
    admin integer DEFAULT 0 NOT NULL,
    donation_amount character varying(11),
    discord_id character varying(40),
    auth_hash character varying(64),
    country_id integer,
    -- Frozen profiles keep their existing times but can't get new ones.
    frozen boolean DEFAULT false NOT NULL,
    frozen_reason character varying(500),
    -- Staff tier (verifier, moderator, admin); NULL = not staff. users.admin keeps the old
    -- board's listing levels (1 standard, 2 shadow, 3 developer).
    role character varying(20) CHECK (role IN ('verifier', 'moderator', 'admin'))
);

--
-- Name: badges; Type: TABLE;
--

CREATE TABLE badges (
    id integer NOT NULL,
    name character varying(100) DEFAULT ''::character varying NOT NULL,
    image character varying(200) DEFAULT ''::character varying NOT NULL,
    description character varying(500) DEFAULT ''::character varying NOT NULL,
    tier integer NOT NULL DEFAULT 1
);

--
-- Name: badges_id_seq; Type: SEQUENCE;
--

CREATE SEQUENCE badges_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: badges_id_seq; Type: SEQUENCE OWNED BY;
--

ALTER SEQUENCE badges_id_seq OWNED BY badges.id;

--
-- Name: badge_entries; Type: TABLE;
--

CREATE TABLE badge_entries (
    id integer NOT NULL,
    badge_id integer NOT NULL,
    profile_number character varying(50) DEFAULT ''::character varying NOT NULL,
    note character varying(100),
    updated timestamp(6) without time zone,
    "timestamp" timestamp(6) without time zone
);

--
-- Name: badge_entries_id_seq; Type: SEQUENCE;
--

CREATE SEQUENCE badge_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: badge_entries_id_seq; Type: SEQUENCE OWNED BY;
--

ALTER SEQUENCE badge_entries_id_seq OWNED BY badge_entries.id;

-- Trigger to update `updated` when a row is updated.
 
    CREATE TRIGGER update_badge_entries_updated BEFORE UPDATE
    ON badge_entries FOR EACH ROW EXECUTE PROCEDURE 
    update_updated_column();

--
-- Name: evidence_requirements id; Type: DEFAULT;
--

ALTER TABLE ONLY evidence_requirements ALTER COLUMN id SET DEFAULT nextval('evidence_requirements_id_seq'::regclass);

--
-- Name: categories id; Type: DEFAULT;
--

ALTER TABLE ONLY categories ALTER COLUMN id SET DEFAULT nextval('categories_id_seq'::regclass);

--
-- Name: category_rules id; Type: DEFAULT;
--

ALTER TABLE ONLY category_rules ALTER COLUMN id SET DEFAULT nextval('category_rules_id_seq'::regclass);


--
-- Name: changelog id; Type: DEFAULT;
--

ALTER TABLE ONLY changelog ALTER COLUMN id SET DEFAULT nextval('changelog_id_seq'::regclass);


--
-- Name: chapters id; Type: DEFAULT;
--

ALTER TABLE ONLY chapters ALTER COLUMN id SET DEFAULT nextval('chapters_id_seq'::regclass);


--
-- Name: coop_bundled id; Type: DEFAULT;
--

ALTER TABLE ONLY coop_bundled ALTER COLUMN id SET DEFAULT nextval('coop_bundled_id_seq'::regclass);


--
-- Name: demos id; Type: DEFAULT;
--

ALTER TABLE ONLY demos ALTER COLUMN id SET DEFAULT nextval('demos_id_seq'::regclass);


--
-- Name: games id; Type: DEFAULT;
--

ALTER TABLE ONLY games ALTER COLUMN id SET DEFAULT nextval('games_id_seq'::regclass);


--
-- Name: maps id; Type: DEFAULT;
--

ALTER TABLE ONLY maps ALTER COLUMN id SET DEFAULT nextval('maps_id_seq'::regclass);

--
-- Name: countries id; Type: DEFAULT;
--

ALTER TABLE ONLY countries ALTER COLUMN id SET DEFAULT nextval('countries_id_seq'::regclass);

--
-- Name: mtriggers id; Type: DEFAULT;
--

ALTER TABLE ONLY mtriggers ALTER COLUMN id SET DEFAULT nextval('mtriggers_id_seq'::regclass);

--
-- Name: mtrigger_entries id; Type: DEFAULT;
--

ALTER TABLE ONLY mtrigger_entries ALTER COLUMN id SET DEFAULT nextval('mtrigger_entries_id_seq'::regclass);



-- --
-- -- Name: categories_id_seq; Type: SEQUENCE SET;
-- --

-- SELECT pg_catalog.setval('categories_id_seq', 109, false);


-- --
-- -- Name: changelog_id_seq; Type: SEQUENCE SET;
-- --

-- SELECT pg_catalog.setval('changelog_id_seq', 157886, true);


-- --
-- -- Name: chapters_id_seq; Type: SEQUENCE SET;
-- --

-- SELECT pg_catalog.setval('chapters_id_seq', 16, false);


-- --
-- -- Name: coop_bundled_id_seq; Type: SEQUENCE SET;
-- --

-- SELECT pg_catalog.setval('coop_bundled_id_seq', 33186, false);


-- --
-- -- Name: demos_id_seq; Type: SEQUENCE SET;
-- --

-- SELECT pg_catalog.setval('demos_id_seq', 27503, true);


-- --
-- -- Name: games_id_seq; Type: SEQUENCE SET;
-- --

-- SELECT pg_catalog.setval('games_id_seq', 2, false);


-- --
-- -- Name: maps_id_seq; Type: SEQUENCE SET;
-- --

-- SELECT pg_catalog.setval('maps_id_seq', 109, false);

--
-- Name: evidence_requirements pk_evidence_requirements_id; Type: CONSTRAINT;
--

ALTER TABLE ONLY evidence_requirements
    ADD CONSTRAINT pk_evidence_requirements_id PRIMARY KEY (id);

--
-- Name: categories pk_categories_id; Type: CONSTRAINT;
--

ALTER TABLE ONLY categories
    ADD CONSTRAINT pk_categories_id PRIMARY KEY (id);

--
-- Name: category_rules pk_category_rules_id; Type: CONSTRAINT;
--

ALTER TABLE ONLY category_rules
    ADD CONSTRAINT pk_category_rules_id PRIMARY KEY (id);

--
-- Name: countries pk_countries_id; Type: CONSTRAINT;
--

ALTER TABLE ONLY countries
    ADD CONSTRAINT pk_countries_id PRIMARY KEY (id);

--
-- Name: changelog pk_changelog_id; Type: CONSTRAINT;
--

ALTER TABLE ONLY changelog
    ADD CONSTRAINT pk_changelog_id PRIMARY KEY (id);


--
-- Name: chapters pk_chapters_id; Type: CONSTRAINT;
--

ALTER TABLE ONLY chapters
    ADD CONSTRAINT pk_chapters_id PRIMARY KEY (id);


--
-- Name: coop_bundled pk_coop_bundled_id; Type: CONSTRAINT;
--

ALTER TABLE ONLY coop_bundled
    ADD CONSTRAINT pk_coop_bundled_id PRIMARY KEY (id);


--
-- Name: games pk_game_id; Type: CONSTRAINT;
--

ALTER TABLE ONLY games
    ADD CONSTRAINT pk_game_id PRIMARY KEY (id);


--
-- Name: maps pk_maps_id; Type: CONSTRAINT;
--

ALTER TABLE ONLY maps
    ADD CONSTRAINT pk_maps_id PRIMARY KEY (id);


--
-- Name: mtriggers pk_mtriggers_id; Type: CONSTRAINT;
--

ALTER TABLE ONLY mtriggers
    ADD CONSTRAINT pk_mtriggers_id PRIMARY KEY (id);

--
-- Name: mtrigger_entries pk_mtrigger_entries_id; Type: CONSTRAINT;
--

ALTER TABLE ONLY mtrigger_entries
    ADD CONSTRAINT pk_mtrigger_entries_id PRIMARY KEY (id);

--
-- Name: users pk_users_profile_number; Type: CONSTRAINT;
--

ALTER TABLE ONLY users
    ADD CONSTRAINT pk_users_profile_number PRIMARY KEY (profile_number);


--
-- Name: demos unq_demos_id; Type: CONSTRAINT;
--

ALTER TABLE ONLY demos
    ADD CONSTRAINT unq_demos_id UNIQUE (id);


--
-- Name: maps unq_maps_steam_id; Type: CONSTRAINT;
--

ALTER TABLE ONLY maps
    ADD CONSTRAINT unq_maps_steam_id UNIQUE (steam_id);


--
-- Name: mtriggers unq_mtriggers_id; Type: CONSTRAINT;
--

ALTER TABLE ONLY mtriggers
    ADD CONSTRAINT unq_mtriggers_id UNIQUE (id);


--
-- Name: mtrigger_entries unq_mtrigger_entries_id; Type: CONSTRAINT;
--

ALTER TABLE ONLY mtrigger_entries
    ADD CONSTRAINT unq_mtrigger_entries_id UNIQUE (id);


--
-- Name: categories fk_categories_category_rules; Type: FK CONSTRAINT;
--

ALTER TABLE ONLY categories
    ADD CONSTRAINT fk_categories_category_rules FOREIGN KEY (rules_id) REFERENCES category_rules(id);


--
-- Name: changelog fk_changelog_categories; Type: FK CONSTRAINT;
--

ALTER TABLE ONLY changelog
    ADD CONSTRAINT fk_changelog_categories FOREIGN KEY (category_id) REFERENCES categories(id);


--
-- Name: changelog fk_changelog_coop_bundled; Type: FK CONSTRAINT;
--

ALTER TABLE ONLY changelog
    ADD CONSTRAINT fk_changelog_coop_bundled FOREIGN KEY (coop_id) REFERENCES coop_bundled(id);


--
-- Name: changelog fk_changelog_demos; Type: FK CONSTRAINT;
--

ALTER TABLE ONLY changelog
    ADD CONSTRAINT fk_changelog_demos FOREIGN KEY (demo_id) REFERENCES demos(id);


--
-- Name: changelog fk_changelog_maps; Type: FK CONSTRAINT;
--

ALTER TABLE ONLY changelog
    ADD CONSTRAINT fk_changelog_maps FOREIGN KEY (map_id) REFERENCES maps(steam_id);


--
-- Name: changelog fk_changelog_users; Type: FK CONSTRAINT;
--

ALTER TABLE ONLY changelog
    ADD CONSTRAINT fk_changelog_users FOREIGN KEY (profile_number) REFERENCES users(profile_number);


--
-- Name: chapters fk_chapters_game_id; Type: FK CONSTRAINT;
--

ALTER TABLE ONLY chapters
    ADD CONSTRAINT fk_chapters_game_id FOREIGN KEY (game_id) REFERENCES games(id);


--
-- Name: coop_bundled fk_coop_bundled_chapters_cl_id2; Type: FK CONSTRAINT;
--

ALTER TABLE ONLY coop_bundled
    ADD CONSTRAINT fk_coop_bundled_chapters_cl_id2 FOREIGN KEY (cl_id2) REFERENCES changelog(id);


--
-- Name: coop_bundled fk_coop_bundled_cl_id1; Type: FK CONSTRAINT;
--

ALTER TABLE ONLY coop_bundled
    ADD CONSTRAINT fk_coop_bundled_cl_id1 FOREIGN KEY (cl_id1) REFERENCES changelog(id);


--
-- Name: coop_bundled fk_coop_bundled_users_u1; Type: FK CONSTRAINT;
--

ALTER TABLE ONLY coop_bundled
    ADD CONSTRAINT fk_coop_bundled_users_u1 FOREIGN KEY (p_id1) REFERENCES users(profile_number);


--
-- Name: coop_bundled fk_coop_bundled_users_u2; Type: FK CONSTRAINT;
--

ALTER TABLE ONLY coop_bundled
    ADD CONSTRAINT fk_coop_bundled_users_u2 FOREIGN KEY (p_id2) REFERENCES users(profile_number);


--
-- Name: maps fk_maps_chapters; Type: FK CONSTRAINT;
--

ALTER TABLE ONLY maps
    ADD CONSTRAINT fk_maps_chapters FOREIGN KEY (chapter_id) REFERENCES chapters(id);

--
-- Name: users fk_users_countries; Type: FK CONSTRAINT;
--

ALTER TABLE ONLY users
    ADD CONSTRAINT fk_users_countries FOREIGN KEY (country_id) REFERENCES countries(id);

--
-- Name: mtriggers fk_mtriggers_maps; Type: FK CONSTRAINT;
--

ALTER TABLE ONLY mtriggers
    ADD CONSTRAINT fk_mtriggers_maps FOREIGN KEY (map_id) REFERENCES maps(steam_id);

--
-- Name: mtriggers fk_mtriggers_categories; Type: FK CONSTRAINT;
--

ALTER TABLE ONLY mtriggers
    ADD CONSTRAINT fk_mtriggers_categories FOREIGN KEY (category_id) REFERENCES categories(id);


--
-- Name: mtrigger_entries fk_mtrigger_entries_mtriggers; Type: FK CONSTRAINT;
--

ALTER TABLE ONLY mtrigger_entries
    ADD CONSTRAINT fk_mtrigger_entries_mtriggers FOREIGN KEY (mtrigger_id) REFERENCES mtriggers(id);

--
-- Name: mtrigger_entries fk_mtrigger_entries_changelog; Type: FK CONSTRAINT;
--

ALTER TABLE ONLY mtrigger_entries
    ADD CONSTRAINT fk_mtrigger_entries_changelog FOREIGN KEY (changelog_id) REFERENCES changelog(id);



--
-- Admin audit log.
--

-- Every change made by an admin (or by the board's own services), newest first.
CREATE TABLE admin_actions (
    id bigserial PRIMARY KEY,
    -- The admin who acted; NULL when the board's services did (see via_service).
    admin_profile character varying(50) REFERENCES users(profile_number),
    via_service boolean NOT NULL DEFAULT false,
    action character varying(50) NOT NULL,
    target_type character varying(30) NOT NULL,
    target_id character varying(50) NOT NULL,
    reason character varying(500),
    -- Before/after values, or the full row for deletions.
    details jsonb,
    created_at timestamp without time zone NOT NULL DEFAULT now()
);
CREATE INDEX admin_actions_created ON admin_actions (created_at DESC);
CREATE INDEX admin_actions_target ON admin_actions (target_type, target_id);

--
-- Steam sign-in.
--

-- One row per signed-in browser. Only a SHA-256 hash of the session cookie is stored.
CREATE TABLE sessions (
    token_hash bytea PRIMARY KEY,
    profile_number character varying(50) NOT NULL REFERENCES users(profile_number) ON DELETE CASCADE,
    created_at timestamp without time zone NOT NULL DEFAULT now(),
    last_seen timestamp without time zone NOT NULL DEFAULT now(),
    expires_at timestamp without time zone NOT NULL,
    user_agent character varying(200)
);
CREATE INDEX sessions_profile_number ON sessions (profile_number);

-- Steam login responses already accepted (openid.response_nonce), so one can't be replayed.
CREATE TABLE openid_nonces (
    nonce character varying(255) PRIMARY KEY,
    seen_at timestamp without time zone NOT NULL DEFAULT now()
);

--
-- Name: legacy_changelog_ids; Type: TABLE;
-- Maps changelog IDs from the boards this one replaces (board.portal2.sr, mel board)
-- to IDs in this database, so old links and autorender requests can be resolved.
--

CREATE TABLE legacy_changelog_ids (
    game_id integer NOT NULL REFERENCES games(id),
    legacy_id bigint NOT NULL,
    changelog_id bigint NOT NULL REFERENCES changelog(id),
    PRIMARY KEY (game_id, legacy_id)
);

--
-- Full-game (speedrun.com-style) leaderboards, kept apart from the Challenge Mode tables.
--

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

--
-- PostgreSQL database dump complete
--

