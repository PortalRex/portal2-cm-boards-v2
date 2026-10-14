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
    is_public boolean DEFAULT false NOT NULL,
    -- Map file name (e.g. sp_a1_intro3), to match submitted demos; Mel's Story and Advanced
    -- maps share theirs. Filled by import_boards.py.
    bsp_name character varying(64)
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
-- Thumbs up / down on runs (a co-op run's are stored against the first entry of its pair).
--

CREATE TABLE run_reactions (
    changelog_id bigint NOT NULL REFERENCES changelog(id) ON DELETE CASCADE,
    profile_number character varying(50) NOT NULL REFERENCES users(profile_number) ON DELETE CASCADE,
    reaction smallint NOT NULL CHECK (reaction IN (-1, 1)),
    created_at timestamp without time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (changelog_id, profile_number)
);

--
-- Every reaction change (up, down, cleared), kept for staff.
--

CREATE TABLE run_reaction_events (
    id bigserial PRIMARY KEY,
    changelog_id bigint NOT NULL REFERENCES changelog(id) ON DELETE CASCADE,
    profile_number character varying(50) NOT NULL REFERENCES users(profile_number) ON DELETE CASCADE,
    -- 1 up, -1 down, NULL cleared.
    reaction smallint CHECK (reaction IN (-1, 1)),
    created_at timestamp without time zone NOT NULL DEFAULT now()
);
CREATE INDEX run_reaction_events_run ON run_reaction_events (changelog_id, created_at DESC);

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
-- PostgreSQL database dump complete
--


--
-- Games, seasons and linked leaderboards (migrations/20261021000000_games_seasons.sql).
--

-- Games, seasons, linked leaderboards and the admin catalog editor. Apply to databases created
-- from an older schema.sql.
--
-- Two maps (leaderboards) can be linked (map_links). A run set on one is also evaluated for
-- the other: if it beats the player's best there, it's recorded there too (a mirror row,
-- changelog.mirror_of). Linking doesn't copy existing times; only runs set after the link.
-- Links to a season's maps only apply inside the season's dates. Triggers create the mirrors
-- and keep them in step with the original (bans, verification, demos, deletion and co-op
-- pairing), so every board query works for linked boards unchanged.
--
-- A season is a game whose maps are copies of a base game's maps (maps.source_map), normally
-- linked to them.

-- Lookups by map, player and pairing (the changelog had none, so per-map queries scanned it all).
CREATE INDEX IF NOT EXISTS idx_changelog_map_score ON changelog (map_id, score);
CREATE INDEX IF NOT EXISTS idx_changelog_profile ON changelog (profile_number);
CREATE INDEX IF NOT EXISTS idx_changelog_coop ON changelog (coop_id) WHERE coop_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_changelog_timestamp ON changelog (timestamp);
CREATE INDEX IF NOT EXISTS idx_coop_bundled_cl1 ON coop_bundled (cl_id1);
CREATE INDEX IF NOT EXISTS idx_coop_bundled_cl2 ON coop_bundled (cl_id2);

-- Season copies need longer map ids than Steam leaderboard ids ("s3-47458").
ALTER TABLE maps ALTER COLUMN steam_id TYPE character varying(32);
ALTER TABLE changelog ALTER COLUMN map_id TYPE character varying(32);
ALTER TABLE categories ALTER COLUMN map_id TYPE character varying(32);
ALTER TABLE mtriggers ALTER COLUMN map_id TYPE character varying(32);

ALTER TABLE games ADD COLUMN IF NOT EXISTS slug character varying(32);
ALTER TABLE games ADD COLUMN IF NOT EXISTS kind character varying(10) NOT NULL DEFAULT 'game' CHECK (kind IN ('game', 'season'));
ALTER TABLE games ADD COLUMN IF NOT EXISTS base_game_id integer REFERENCES games(id);
ALTER TABLE games ADD COLUMN IF NOT EXISTS starts_at timestamp without time zone;
ALTER TABLE games ADD COLUMN IF NOT EXISTS ends_at timestamp without time zone;
ALTER TABLE games ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE games ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
UPDATE games SET slug = 'portal2', sort_order = 1 WHERE id = 1 AND slug IS NULL;
UPDATE games SET slug = 'mel', sort_order = 2 WHERE id = 2 AND slug IS NULL;
UPDATE games SET slug = 'game-' || id WHERE slug IS NULL;
ALTER TABLE games ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS unq_games_slug ON games (slug);
ALTER TABLE games ALTER COLUMN game_name TYPE character varying(80);

ALTER TABLE chapters ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
UPDATE chapters SET sort_order = id WHERE sort_order = 0;

ALTER TABLE maps ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS source_map character varying(32) REFERENCES maps(steam_id);
UPDATE maps SET sort_order = id WHERE sort_order = 0;
CREATE INDEX IF NOT EXISTS idx_maps_source_map ON maps (source_map) WHERE source_map IS NOT NULL;

ALTER TABLE changelog ADD COLUMN IF NOT EXISTS mirror_of bigint REFERENCES changelog(id);
CREATE INDEX IF NOT EXISTS idx_changelog_mirror_of ON changelog (mirror_of) WHERE mirror_of IS NOT NULL;
ALTER TABLE coop_bundled ADD COLUMN IF NOT EXISTS mirror_of bigint REFERENCES coop_bundled(id);
CREATE INDEX IF NOT EXISTS idx_coop_bundled_mirror_of ON coop_bundled (mirror_of) WHERE mirror_of IS NOT NULL;

-- Rank a time would have on a map: 1 + players whose best (verified, unbanned) is faster.
CREATE OR REPLACE FUNCTION season_rank(p_map character varying, p_score integer, p_player character varying) RETURNS integer AS $$
    SELECT 1 + COUNT(DISTINCT x.profile_number)::integer
    FROM changelog AS x JOIN users AS u ON u.profile_number = x.profile_number
    WHERE x.map_id = p_map AND x.score < p_score AND x.verified AND NOT x.banned AND NOT u.banned
      AND x.profile_number <> p_player AND x.profile_number <> 'N/A';
$$ LANGUAGE sql STABLE;

CREATE TABLE IF NOT EXISTS map_links (
    map_a character varying(32) NOT NULL REFERENCES maps(steam_id) ON DELETE CASCADE,
    map_b character varying(32) NOT NULL REFERENCES maps(steam_id) ON DELETE CASCADE,
    created_at timestamp without time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
    PRIMARY KEY (map_a, map_b),
    CHECK (map_a < map_b)
);
CREATE INDEX IF NOT EXISTS idx_map_links_b ON map_links (map_b);

-- The maps linked to a map, with the time from which the link applies, as of a moment:
-- links to a season's map only inside the season's dates.
CREATE OR REPLACE FUNCTION linked_maps(p_map character varying, p_at timestamp without time zone)
RETURNS TABLE (steam_id character varying, default_cat_id integer) AS $$
    SELECT m.steam_id, m.default_cat_id
    FROM map_links AS l
        JOIN maps AS m ON m.steam_id = CASE WHEN l.map_a = p_map THEN l.map_b ELSE l.map_a END
        JOIN chapters AS c ON c.id = m.chapter_id
        JOIN games AS g ON g.id = c.game_id
    WHERE (l.map_a = p_map OR l.map_b = p_map)
      AND p_at >= l.created_at
      AND (g.kind <> 'season' OR (p_at >= g.starts_at AND (g.ends_at IS NULL OR p_at < g.ends_at)))
      AND m.default_cat_id IS NOT NULL;
$$ LANGUAGE sql STABLE;

-- Records an original run on each linked map where it beats the player's best there.
CREATE OR REPLACE FUNCTION link_mirror_run(src_id bigint) RETURNS void AS $$
DECLARE
    src changelog%ROWTYPE;
    cp RECORD;
    prev_id bigint;
    prev_score integer;
BEGIN
    SELECT * INTO src FROM changelog WHERE id = src_id;
    IF NOT FOUND OR src.mirror_of IS NOT NULL OR src.profile_number = 'N/A' OR src.banned THEN
        RETURN;
    END IF;
    -- Only main-category runs carry over.
    IF src.category_id IS DISTINCT FROM (SELECT default_cat_id FROM maps WHERE steam_id = src.map_id) THEN
        RETURN;
    END IF;
    FOR cp IN SELECT * FROM linked_maps(src.map_id, src.timestamp) LOOP
        CONTINUE WHEN EXISTS (SELECT 1 FROM changelog AS x WHERE x.mirror_of = src.id AND x.map_id = cp.steam_id);
        prev_id := NULL;
        prev_score := NULL;
        SELECT x.id, x.score INTO prev_id, prev_score
        FROM changelog AS x
        WHERE x.map_id = cp.steam_id AND x.profile_number = src.profile_number AND x.verified AND NOT x.banned AND x.category_id = cp.default_cat_id
        ORDER BY x.score, x.timestamp LIMIT 1;
        -- Each board keeps only improvements on the player's best there.
        CONTINUE WHEN prev_id IS NOT NULL AND src.score >= prev_score;
        INSERT INTO changelog (timestamp, profile_number, score, map_id, demo_id, banned, youtube_id, previous_id,
            post_rank, pre_rank, submission, note, category_id, score_delta, verified, admin_note, autorender_id,
            segments, wr_hidden, mirror_of)
        VALUES (src.timestamp, src.profile_number, src.score, cp.steam_id, src.demo_id, src.banned, src.youtube_id, prev_id,
            season_rank(cp.steam_id, src.score, src.profile_number),
            CASE WHEN prev_id IS NULL THEN NULL ELSE season_rank(cp.steam_id, prev_score, src.profile_number) END,
            src.submission, src.note, cp.default_cat_id,
            CASE WHEN prev_id IS NULL THEN NULL ELSE src.score - prev_score END,
            src.verified, src.admin_note, src.autorender_id, src.segments, COALESCE(src.wr_hidden, false), src.id);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS season_mirror_run(bigint);
DROP FUNCTION IF EXISTS season_backfill(integer);

-- Mirrors an original co-op pairing onto each linked map where either half is mirrored.
CREATE OR REPLACE FUNCTION season_mirror_bundle(bundle_id bigint) RETURNS void AS $$
DECLARE
    b coop_bundled%ROWTYPE;
    copy_map character varying;
    c1 bigint;
    c2 bigint;
    filler bigint;
    mb bigint;
BEGIN
    SELECT * INTO b FROM coop_bundled WHERE id = bundle_id;
    IF NOT FOUND OR b.mirror_of IS NOT NULL THEN
        RETURN;
    END IF;
    FOR copy_map IN
        SELECT DISTINCT x.map_id FROM changelog AS x WHERE x.mirror_of IN (b.cl_id1, b.cl_id2)
    LOOP
        SELECT id INTO filler FROM changelog WHERE profile_number = 'N/A' AND map_id = copy_map ORDER BY id LIMIT 1;
        SELECT id INTO c1 FROM changelog WHERE mirror_of = b.cl_id1 AND map_id = copy_map;
        SELECT id INTO c2 FROM changelog WHERE mirror_of = b.cl_id2 AND map_id = copy_map;
        c1 := COALESCE(c1, filler);
        c2 := COALESCE(c2, filler);
        CONTINUE WHEN c1 IS NULL OR c2 IS NULL;
        SELECT mbx.id INTO mb FROM coop_bundled AS mbx JOIN changelog AS x ON x.id = mbx.cl_id1
        WHERE mbx.mirror_of = b.id AND x.map_id = copy_map;
        IF mb IS NULL THEN
            INSERT INTO coop_bundled (p_id1, p_id2, p1_is_host, cl_id1, cl_id2, mirror_of)
            VALUES (b.p_id1, b.p_id2, b.p1_is_host, c1, c2, b.id) RETURNING id INTO mb;
        ELSE
            UPDATE coop_bundled SET p_id1 = b.p_id1, p_id2 = b.p_id2, p1_is_host = b.p1_is_host, cl_id1 = c1, cl_id2 = c2 WHERE id = mb;
        END IF;
        UPDATE changelog SET coop_id = NULL WHERE coop_id = mb AND id NOT IN (c1, c2);
        UPDATE changelog SET coop_id = mb WHERE id IN (c1, c2) AND profile_number <> 'N/A';
        mb := NULL;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Drops the mirrored runs on a game's maps (before deleting it).
CREATE OR REPLACE FUNCTION season_clear(p_game integer) RETURNS void AS $$
BEGIN
    CREATE TEMP TABLE IF NOT EXISTS season_clear_ids (id bigint) ON COMMIT DROP;
    DELETE FROM season_clear_ids;
    INSERT INTO season_clear_ids
        SELECT x.id FROM changelog AS x JOIN maps AS m ON m.steam_id = x.map_id JOIN chapters AS c ON c.id = m.chapter_id
        WHERE c.game_id = p_game AND x.mirror_of IS NOT NULL;
    UPDATE changelog SET coop_id = NULL WHERE id IN (SELECT id FROM season_clear_ids);
    DELETE FROM coop_bundled WHERE cl_id1 IN (SELECT id FROM season_clear_ids) OR cl_id2 IN (SELECT id FROM season_clear_ids);
    UPDATE changelog SET previous_id = NULL WHERE previous_id IN (SELECT id FROM season_clear_ids);
    DELETE FROM changelog WHERE id IN (SELECT id FROM season_clear_ids);
END;
$$ LANGUAGE plpgsql;

-- Triggers keeping mirrors in step with the originals.
CREATE OR REPLACE FUNCTION season_changelog_insert() RETURNS trigger AS $$
BEGIN
    IF NEW.mirror_of IS NULL AND NEW.profile_number <> 'N/A'
       AND EXISTS (SELECT 1 FROM map_links WHERE map_a = NEW.map_id OR map_b = NEW.map_id) THEN
        PERFORM link_mirror_run(NEW.id);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION season_changelog_update() RETURNS trigger AS $$
BEGIN
    IF NEW.mirror_of IS NULL THEN
        UPDATE changelog SET timestamp = NEW.timestamp, profile_number = NEW.profile_number, score = NEW.score,
            banned = NEW.banned, verified = NEW.verified, demo_id = NEW.demo_id, youtube_id = NEW.youtube_id,
            note = NEW.note, admin_note = NEW.admin_note, autorender_id = NEW.autorender_id, segments = NEW.segments,
            wr_hidden = COALESCE(NEW.wr_hidden, false), submission = NEW.submission
        WHERE mirror_of = NEW.id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION season_changelog_delete() RETURNS trigger AS $$
BEGIN
    IF OLD.mirror_of IS NULL AND EXISTS (SELECT 1 FROM changelog WHERE mirror_of = OLD.id) THEN
        UPDATE changelog SET coop_id = NULL
        WHERE coop_id IN (SELECT cb.id FROM coop_bundled AS cb JOIN changelog AS x ON x.id IN (cb.cl_id1, cb.cl_id2) WHERE x.mirror_of = OLD.id);
        DELETE FROM coop_bundled WHERE cl_id1 IN (SELECT id FROM changelog WHERE mirror_of = OLD.id)
            OR cl_id2 IN (SELECT id FROM changelog WHERE mirror_of = OLD.id);
        UPDATE changelog SET previous_id = NULL WHERE previous_id IN (SELECT id FROM changelog WHERE mirror_of = OLD.id);
        DELETE FROM mtrigger_entries WHERE changelog_id IN (SELECT id FROM changelog WHERE mirror_of = OLD.id);
        DELETE FROM changelog WHERE mirror_of = OLD.id;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION season_bundle_upsert() RETURNS trigger AS $$
BEGIN
    IF NEW.mirror_of IS NULL THEN
        PERFORM season_mirror_bundle(NEW.id);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION season_bundle_delete() RETURNS trigger AS $$
BEGIN
    IF OLD.mirror_of IS NULL THEN
        UPDATE changelog SET coop_id = NULL WHERE coop_id IN (SELECT id FROM coop_bundled WHERE mirror_of = OLD.id);
        DELETE FROM coop_bundled WHERE mirror_of = OLD.id;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS season_changelog_insert ON changelog;
CREATE TRIGGER season_changelog_insert AFTER INSERT ON changelog FOR EACH ROW EXECUTE FUNCTION season_changelog_insert();
DROP TRIGGER IF EXISTS season_changelog_update ON changelog;
CREATE TRIGGER season_changelog_update AFTER UPDATE ON changelog FOR EACH ROW
    WHEN (OLD.mirror_of IS NULL AND (OLD.timestamp, OLD.profile_number, OLD.score, OLD.banned, OLD.verified, OLD.demo_id, OLD.youtube_id,
          OLD.note, OLD.admin_note, OLD.autorender_id, OLD.wr_hidden, OLD.submission)
      IS DISTINCT FROM (NEW.timestamp, NEW.profile_number, NEW.score, NEW.banned, NEW.verified, NEW.demo_id, NEW.youtube_id,
          NEW.note, NEW.admin_note, NEW.autorender_id, NEW.wr_hidden, NEW.submission) OR OLD.segments IS DISTINCT FROM NEW.segments)
    EXECUTE FUNCTION season_changelog_update();
DROP TRIGGER IF EXISTS season_changelog_delete ON changelog;
CREATE TRIGGER season_changelog_delete BEFORE DELETE ON changelog FOR EACH ROW EXECUTE FUNCTION season_changelog_delete();
DROP TRIGGER IF EXISTS season_bundle_upsert ON coop_bundled;
CREATE TRIGGER season_bundle_upsert AFTER INSERT OR UPDATE OF p_id1, p_id2, p1_is_host, cl_id1, cl_id2 ON coop_bundled FOR EACH ROW EXECUTE FUNCTION season_bundle_upsert();
DROP TRIGGER IF EXISTS season_bundle_delete ON coop_bundled;
CREATE TRIGGER season_bundle_delete BEFORE DELETE ON coop_bundled FOR EACH ROW EXECUTE FUNCTION season_bundle_delete();

--
-- Per-run stats from demos (migrations/20261022000000_run_stats.sql).
--

-- Per-run stats read from demos. Apply to databases created from an older schema.sql.
--
-- portals: portals placed in the run, from the challenge mode scoreboard the game sends at the
-- end of a run (stored for submitted demos; db/dbscript/import_demo_stats.py fills it in for the
-- archived board demos). Linked copies of a run (see 20261021000000_games_seasons.sql) carry it too.

ALTER TABLE changelog ADD COLUMN IF NOT EXISTS portals smallint;

CREATE OR REPLACE FUNCTION link_mirror_run(src_id bigint) RETURNS void AS $$
DECLARE
    src changelog%ROWTYPE;
    cp RECORD;
    prev_id bigint;
    prev_score integer;
BEGIN
    SELECT * INTO src FROM changelog WHERE id = src_id;
    IF NOT FOUND OR src.mirror_of IS NOT NULL OR src.profile_number = 'N/A' OR src.banned THEN
        RETURN;
    END IF;
    -- Only main-category runs carry over.
    IF src.category_id IS DISTINCT FROM (SELECT default_cat_id FROM maps WHERE steam_id = src.map_id) THEN
        RETURN;
    END IF;
    FOR cp IN SELECT * FROM linked_maps(src.map_id, src.timestamp) LOOP
        CONTINUE WHEN EXISTS (SELECT 1 FROM changelog AS x WHERE x.mirror_of = src.id AND x.map_id = cp.steam_id);
        prev_id := NULL;
        prev_score := NULL;
        SELECT x.id, x.score INTO prev_id, prev_score
        FROM changelog AS x
        WHERE x.map_id = cp.steam_id AND x.profile_number = src.profile_number AND x.verified AND NOT x.banned AND x.category_id = cp.default_cat_id
        ORDER BY x.score, x.timestamp LIMIT 1;
        -- Each board keeps only improvements on the player's best there.
        CONTINUE WHEN prev_id IS NOT NULL AND src.score >= prev_score;
        INSERT INTO changelog (timestamp, profile_number, score, map_id, demo_id, banned, youtube_id, previous_id,
            post_rank, pre_rank, submission, note, category_id, score_delta, verified, admin_note, autorender_id,
            segments, wr_hidden, mirror_of, portals)
        VALUES (src.timestamp, src.profile_number, src.score, cp.steam_id, src.demo_id, src.banned, src.youtube_id, prev_id,
            season_rank(cp.steam_id, src.score, src.profile_number),
            CASE WHEN prev_id IS NULL THEN NULL ELSE season_rank(cp.steam_id, prev_score, src.profile_number) END,
            src.submission, src.note, cp.default_cat_id,
            CASE WHEN prev_id IS NULL THEN NULL ELSE src.score - prev_score END,
            src.verified, src.admin_note, src.autorender_id, src.segments, COALESCE(src.wr_hidden, false), src.id, src.portals);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION season_changelog_update() RETURNS trigger AS $$
BEGIN
    IF NEW.mirror_of IS NULL THEN
        UPDATE changelog SET timestamp = NEW.timestamp, profile_number = NEW.profile_number, score = NEW.score,
            banned = NEW.banned, verified = NEW.verified, demo_id = NEW.demo_id, youtube_id = NEW.youtube_id,
            note = NEW.note, admin_note = NEW.admin_note, autorender_id = NEW.autorender_id, segments = NEW.segments,
            wr_hidden = COALESCE(NEW.wr_hidden, false), submission = NEW.submission, portals = NEW.portals
        WHERE mirror_of = NEW.id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS season_changelog_update ON changelog;
CREATE TRIGGER season_changelog_update AFTER UPDATE ON changelog FOR EACH ROW
    WHEN (OLD.mirror_of IS NULL AND (OLD.timestamp, OLD.profile_number, OLD.score, OLD.banned, OLD.verified, OLD.demo_id, OLD.youtube_id,
          OLD.note, OLD.admin_note, OLD.autorender_id, OLD.wr_hidden, OLD.submission)
      IS DISTINCT FROM (NEW.timestamp, NEW.profile_number, NEW.score, NEW.banned, NEW.verified, NEW.demo_id, NEW.youtube_id,
          NEW.note, NEW.admin_note, NEW.autorender_id, NEW.wr_hidden, NEW.submission) OR OLD.segments IS DISTINCT FROM NEW.segments OR OLD.portals IS DISTINCT FROM NEW.portals)
    EXECUTE FUNCTION season_changelog_update();

--
-- Anonymous run reports (migrations/20261023000000_run_reports.sql).
--

-- Anonymous run reports. Apply to databases created from an older schema.sql.
--
-- Anyone can report a run; staff see the report but not who sent it. reporter_key is a salted
-- hash of the reporter (account or address), used only to stop duplicate reports and spam.
CREATE TABLE IF NOT EXISTS run_reports (
    id bigserial PRIMARY KEY,
    changelog_id bigint NOT NULL REFERENCES changelog(id) ON DELETE CASCADE,
    reason character varying(20) NOT NULL CHECK (reason IN ('cheating', 'wrong_time', 'wrong_player', 'bad_proof', 'other')),
    details character varying(1000),
    reporter_key character varying(64) NOT NULL,
    status character varying(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
    resolved_by character varying(50) REFERENCES users(profile_number),
    resolved_at timestamp without time zone,
    resolution_note character varying(500),
    created_at timestamp without time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);
CREATE INDEX IF NOT EXISTS idx_run_reports_status ON run_reports (status, id DESC);
CREATE INDEX IF NOT EXISTS idx_run_reports_reporter ON run_reports (reporter_key, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS unq_run_reports_open ON run_reports (changelog_id, reporter_key) WHERE status = 'open';

--
-- Staff-set profile names and pictures (migrations/20261024000000_profile_overrides.sql).
--

-- Staff-set profile names and pictures. Apply to databases created from an older schema.sql.
--
-- Staff can replace a player's displayed name (users.board_name) and picture; the locks keep
-- Steam sign-ins and avatar refreshes from undoing that until staff reset them.
ALTER TABLE users ADD COLUMN IF NOT EXISTS name_locked boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_locked boolean NOT NULL DEFAULT false;

--
-- Empty Mel chapters removed (migrations/20261026000000_empty_chapters.sql).
--

-- Removes chapters without maps that the Mel import created (the Mel board's empty Advanced
-- "1952" chapter, imported as a second Story chapter). Apply to databases created from an
-- older schema.sql; the importer now skips them.
DELETE FROM chapters AS c
WHERE c.game_id = 2 AND NOT EXISTS (SELECT 1 FROM maps AS m WHERE m.chapter_id = c.id);

-- Player search matches names with ILIKE '%text%'; a trigram index serves that directly instead
-- of scanning every user.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_users_name_trgm
    ON users USING gin (COALESCE(board_name, steam_name) gin_trgm_ops);
-- State of the Steam leaderboard sync. A map's first pass only records what Steam shows (the
-- baseline): times the board doesn't have by then are never pulled in (Steam has no dates, and
-- the old board leaves some Steam times out on purpose). After that, only entries that change on
-- Steam between passes are considered as new runs.
CREATE TABLE IF NOT EXISTS steam_sync_maps (
    map_id character varying PRIMARY KEY REFERENCES maps(steam_id),
    last_hash bigint,
    last_pass timestamp without time zone
);

-- The leaderboard entries seen on the last pass (each player's score), to spot changes.
CREATE TABLE IF NOT EXISTS steam_sync_entries (
    map_id character varying NOT NULL REFERENCES maps(steam_id) ON DELETE CASCADE,
    profile_number character varying NOT NULL,
    score integer NOT NULL,
    PRIMARY KEY (map_id, profile_number)
);

-- The old boards' changelog entries as last pulled (tools/old_boards_sync.rs), to tell what
-- changed there since: only those changes are applied, so edits made here aren't undone.
CREATE TABLE IF NOT EXISTS old_board_runs (
    game_id integer NOT NULL REFERENCES games(id),
    legacy_id bigint NOT NULL,
    banned boolean NOT NULL,
    pending boolean NOT NULL,
    youtube_id character varying(30),
    note character varying(100),
    has_demo boolean NOT NULL,
    autorender_id character varying(11),
    seen_at timestamp without time zone NOT NULL,
    PRIMARY KEY (game_id, legacy_id)
);
