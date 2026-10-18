<!-- markdownlint-disable MD024 -->

# Portal 2 Leaderboards Revision (board.portal2.sr)

A re-write of the original Portal 2 Challenge Mode Leaderboards designed to take advantage of modern web technology and allow for the community to take a more active role in developing the leaderboards.

## Web-Server

Everything this fork changes in the server, database and backend service (endpoints, migrations, config, permissions) is summarised in [BACKEND_CHANGES.md](BACKEND_CHANGES.md).

### Building

Using sqlx to pass queries to our database. REST API to be documented. Requires the Database to be up and operational.

**Be sure to copy the `.env.example` file, remove `.example` from the file name, and change the contents of the file to suite your use-case.**

#### Local .env Example

```txt
DATABASE_URL=postgresql://username:123@localhost/p2boards
SERVER.HOST=0.0.0.0
SERVER.PORT=8080
PROOF.RESULTS=500
PROOF.DEMO=200
PROOF.VIDEO=200
STEAM.API_KEY=
BACKBLAZE.KEYID=
BACKBLAZE.KEY=
BACKBLAZE.BUCKET=
SERVER.PUBLIC_URL=http://localhost:3000
# SERVER.BEHIND_PROXY=true
SERVICE.TOKEN=
DEMO.PARSER=./demo-parser/parse_demo.mjs
DEMO.STORAGE=./demos
# DEMO.ARCHIVE=/srv/demos/p2;/srv/demos/mel
# RANKS.COOP=run
# SYNC.STEAM=true
# SYNC.MINUTES=10
# SYNC.RANK_LIMIT=500
# SYNC.OLD_BOARDS=true
# SYNC.OLD_BOARDS_HOURS=0,12
# SYNC.OLD_BOARDS_TZ=America/Chicago
# RANKS.COOP_PROOF_SINCE=2026-11-01 00:00:00
RUST_LOG=1
RUST_LOG="actix_web=info"
```

- `SERVER.PUBLIC_URL` is the address people use to reach the site, which serves the API under `/api` (e.g. `https://board.portal2.sr`). Steam sign-in sends users back to it, and session cookies are marked Secure when it's https. Defaults to `http://localhost:3000`. Set `SERVER.BEHIND_PROXY=true` when a reverse proxy is in front (and bind `SERVER.HOST` to `127.0.0.1`), so rate limits and report de-duplication see the real client address from `X-Forwarded-For`.
- `STEAM.API_KEY` is used to fill in a user's Steam name and avatar when they sign in (sign-in itself works without it).
- `SERVICE.TOKEN` is a long random string shared with the board's own services in `/backend` (set the same value as `SERVICE_TOKEN` in `backend/.env`). They send it in an `X-Service-Token` header. Every endpoint that changes data requires either that token or a signed-in admin (`users.admin > 0`); when it's unset, only admins can make changes.
- `DEMO.PARSER` and `DEMO.STORAGE` enable run submissions (the navbar's **Submit Run**). Submitted demos are read by `server/demo-parser/parse_demo.mjs` (Node 18+; run `npm install` in that folder) for the map, the scoreboard time and the players, and saved in `DEMO.STORAGE`. `DEMO.NODE` sets the node executable if it isn't on the PATH. `DEMO.ARCHIVE` lists the folders (separated by `;`) holding the old boards' demo files, so imported runs' demos can be downloaded. `RANKS.COOP` sets co-op ranking: `run` (default) gives each run one rank (1, 2, 3); `player` gives each player one (1, 1, 3), as the old boards did. `RANKS.COOP_PROOF_SINCE` (UTC, set it to the launch) makes new top-200 co-op runs wait for a demo from each player before they're verified.
- The server can pull new Portal 2 times from Steam's leaderboards itself: `SYNC.STEAM=true` turns it on (every `SYNC.MINUTES`, 10 by default; times in each map's top `SYNC.RANK_LIMIT` on Steam, 500 by default). `STEAM.API_KEY` lets it create accounts for players it hasn't seen. Portal Stories: Mel has no public Steam leaderboards, so Mel times come from demo submissions. Until the old boards are retired, `SYNC.OLD_BOARDS=true` also pulls from them at midnight and noon (America/Chicago): Mel runs, demos, videos, comments and bans that Steam can't show (see BACKEND_CHANGES.md §13). Players can only submit demos they are in; admins (`users.role = admin`) may also enter the map, time, player or partner by hand, which is recorded in the audit log.

Assuming the database is up and running, start the server with `cargo run` in `/server`

#### Games, seasons and linked leaderboards

Admins manage games, chapters, maps and categories from the staff panel (**Staff → Games**), including dragging maps between chapters. The site loads this catalog from `GET /api/v1/catalog` at startup, so new games and seasons appear in the map list, leaderboards, profiles and score updates without code changes.

- A **season** copies a game's map pool and is open between a start and an optional end date (UTC).
- Maps can be **linked** (each season's maps are linked to the originals by default; a whole game can be linked to another, e.g. Season 1 to Season 0). A run set on one linked map is also recorded on the other if it beats the player's best there; times set before the link aren't copied, and links to a season only apply inside its dates. A submission that isn't an improvement on the submitted map is recorded on the first linked board where it is, and refused if it improves none.
- This is done by database triggers (`migrations/20261021000000_games_seasons.sql`), which keep the linked copies in step with the original run (bans, verification, demos, deletion, co-op pairing).

#### Run reports

Anyone can report a run from its details (`POST /api/v1/runs/{id}/report`). Reports are anonymous: staff see the run, the reason and the details, and the reporter is kept only as a salted hash (from `SERVICE.TOKEN`, else `STEAM.API_KEY`) to stop duplicates and spam (5 reports an hour). Staff work through them under **Staff → Reports**, resolving or dismissing each (recorded in the audit log).

#### Demo stats

Portal counts come from the challenge mode scoreboard in each demo: submitted demos store theirs, and for the archived board demos run `node server/demo-parser/demo_stats.mjs <demo dir> stats.csv` (one CSV per game) then `python db/dbscript/import_demo_stats.py --db <url> --p2 p2.csv --mel mel.csv`. Profiles show them on the Stats tab with activity and co-op partners (`GET /api/v1/profile/stats/{steam id}?game_id=`).

#### Features

* Endpoints interacting with the data on the boards. Documented [here](https://danielbatesj.github.io/Portal2-Boards-Rust-API-Docs/docs/target/doc/doc/server/index.html).
* Feature parity with current boards started by [ncla](https://github.com/ncla), updated & maintained by [iVerb](https://github.com/iVerb1) & [Jonese](https://github.com/jonese1234).
* Support for enhanced admin capabilities.
* Category support built in.
* Coupling of cooperative times.

## Back-end

### Building

The backend now works as a REST API that allows for updating of scores from the official steam leaderboards, as well as point calculations and avatar updating. It handles direct interactions with Valve's API.

The backend does not rely on a database, but does depend on the webserver running to be able to pull information about the current state of the boards.

You're required to have a steam API key, apply for one [here](https://steamcommunity.com/dev/apikey).
Copy the `.env.example` file in the `/backend` folder, and rename it to `.env`, then fill out the steam_api_key value.

#### .env Example

```txt
STEAM_API_KEY=8U0SG8SDG7S0DHISD0FHS0DV7SD
```

Assuming the web server is running locally, run with `cargo run` in `/backend`

#### Features

* Update the web server with scores from the steam leaderboard.
* Update profile images for users from the steam API.
* Create new users when their score is added to the leaderboards.
* Calculate the points to display on the leaderboards.

## Database

### Building

* Install `postgres` and setup a user (reference the `DATABASE_URL` bellow).
* Open psql console, `CREATE DATABASE p2boards;`
* Load the latest dump from `/db/dbdump` with `psql p2boards < most_recent_dump_file_name.sql`

## Front-end

### Building

The front-end build can be done with `npm install` in the `/board-portal-2` folder and once dependencies are installed, the client server can be started with `npm start`.

#### Features

* Supports querying a running webserver on its given endpoints for changelog, preview pages, sp maps and coop maps.
* Light and dark theme support.
* Prototyped page designs for many auxiliary pages.

## Docker

`docker-compose.yaml` runs the whole board: Postgres (`db`), the web server (`server`) and the site (`web`, nginx serving the built frontend and passing `/api` to the server), at <http://localhost:3000>. You need Docker with the Compose plugin (Docker Desktop includes it; on WSL, either Docker Desktop or Docker Engine inside WSL works).

### First start

1. Copy `server/.env.example` to `server/.env` and fill it in. Only `SERVICE.TOKEN` (a long random string, e.g. `openssl rand -hex 32`) and, optionally, `STEAM.API_KEY` matter here: the database address, host, port and storage paths are set in `docker-compose.yaml`. If you serve the site somewhere other than `http://localhost:3000`, set `SERVER.PUBLIC_URL` to match (and `WEB_PORT=<port>` in a `.env` next to `docker-compose.yaml` for another local port).
2. `docker compose up -d --build`

An empty database gets the tables from `db/dbscript/schema.sql` (no runs, games or maps). To load a database dump (`pg_dump -Fc` file or plain `.sql`):

```bash
./scripts/restore-db.sh ~/path/to/p2boards.dump
```

It replaces everything in the database, runs `ANALYZE` (a restore has no planner statistics, which makes some pages take seconds) and restarts the server.

### Day to day

```bash
docker compose up -d --build   # start, or rebuild and restart after pulling changes
docker compose logs -f server  # follow the server's log
docker compose down            # stop (the data stays)
docker compose exec db psql -U docker p2boards   # database shell
```

### Developing the frontend

The site is being rewritten (React + Vite + TypeScript, see [FRONTEND_REWRITE.md](FRONTEND_REWRITE.md)). The new app lives in `./frontend`; the old Create React App site is in `./frontend-legacy`, kept only as a reference until the rewrite reaches parity. Don't modify it.

Until the new app builds, `docker-compose.dev.yaml` runs the legacy site on React's dev server from `./frontend-legacy` instead of the nginx build, so changes reload in the browser as you save:

```bash
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up -d
```

To run the legacy site next to the new one for comparison, run `npm start` in `frontend-legacy/` with `REACT_APP_API_URL=/api/v1 DEV_API_PROXY=http://localhost:8080 PORT=3001`.

To make that the default on your machine, copy `.env.example` to `.env` (it's gitignored) and uncomment `COMPOSE_FILE`. Server changes still need `docker compose up -d --build server`.

The database lives in the `p2boards_pgdata` volume and submitted demos and map images in `p2boards_uploads`; `docker compose down -v` deletes both.

## Original Project Team

This project started as a Senior Capstone Project for the following members.

* [@DanielBatesJ](https://github.com/DanielBatesJ)
* [@MitchellBaker65](https://github.com/MitchellBaker65)
* [@Pixel-Knight](https://github.com/Pixel-Knight)
* [@MurphyMichael](https://github.com/MurphyMichael)
* [@JFiedler23](https://github.com/JFiedler23)

## Project References

* [Original Portal 2 Boards](https://github.com/iVerb1/Portal2Boards)
* [Least Portals Github](https://github.com/NeKzor/lp)
