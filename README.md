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
SERVICE.TOKEN=
DEMO.PARSER=./demo-parser/parse_demo.mjs
DEMO.STORAGE=./demos
# DEMO.ARCHIVE=/srv/demos/p2;/srv/demos/mel
# RANKS.COOP=run
RUST_LOG=1
RUST_LOG="actix_web=info"
```

- `SERVER.PUBLIC_URL` is the address people use to reach the site, which serves the API under `/api` (e.g. `https://board.portal2.sr`). Steam sign-in sends users back to it, and session cookies are marked Secure when it's https. Defaults to `http://localhost:3000`.
- `STEAM.API_KEY` is used to fill in a user's Steam name and avatar when they sign in (sign-in itself works without it).
- `SERVICE.TOKEN` is a long random string shared with the board's own services in `/backend` (set the same value as `SERVICE_TOKEN` in `backend/.env`). They send it in an `X-Service-Token` header. Every endpoint that changes data requires either that token or a signed-in admin (`users.admin > 0`); when it's unset, only admins can make changes.
- `DEMO.PARSER` and `DEMO.STORAGE` enable run submissions (the navbar's **Submit Run**). Submitted demos are read by `server/demo-parser/parse_demo.mjs` (Node 18+; run `npm install` in that folder) for the map, the scoreboard time and the players, and saved in `DEMO.STORAGE`. `DEMO.NODE` sets the node executable if it isn't on the PATH. `DEMO.ARCHIVE` lists the folders (separated by `;`) holding the old boards' demo files, so imported runs' demos can be downloaded. `RANKS.COOP` sets co-op ranking: `run` (default) gives each run one rank (1, 2, 3); `player` gives each player one (1, 1, 3), as the old boards did. Players can only submit demos they are in; admins (`users.role = admin`) may also enter the map, time, player or partner by hand, which is recorded in the audit log.

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

## Should I set up this environment with Docker? Or set it up locally?

[@cesarila](https://github.com/cesarila) has contributed a working Docker solution to building the boards.
For those unfamiliar with Docker, it allows you to run different container environments that act similar to to lightweight Virtual Machines, where you can define ahead of time what is installed on the containers when they're built.

This means minimal technical knowledge needed outside of learning to use Docker (details below). The main drawback of this is that you have less direct control over your environment, and the performance is much worse.

If you're familiar with development on Linux/WSL, I would recommend installing Postgres, Rust and Node locally, but if you're looking to mess around and learn as a beginner, or only want to work on the Front-end, I would recommend using Docker.

Additionally, if you want to focus on entirely front-end contributions, contact Daniel for information on a publicly accessible IP you can use to hit the backend API endpoints without needing to build it on your machine.

## Docker Setup Guide (Web-Server & Database)

### Prerequisites

1. Docker
    1. [Get Docker](https://docs.docker.com/get-docker/)
    2. Optional Post-Installation Steps:
        * [Linux](https://docs.docker.com/engine/install/linux-postinstall/)
1. Have docker-compose available (Linux only, comes bundled with Docker desktop for Mac and Windows):
    * [Linux Install](https://docs.docker.com/compose/cli-command/#install-on-linux)
    * Short Version:

        ```bash
        mkdir -p ~/.docker/cli-plugins/
        sudo curl -L "https://github.com/docker/compose/releases/download/v2.1.0/docker-compose-$(uname -s)-$(uname -m)" -o ~/.docker/cli-plugins/docker-compose
        sudo chmod +x ~/.docker/cli-plugins
        ```

        * Note: v2.1.0 is the latest release at the time of writing this. All releases are available [here](https://github.com/docker/compose/releases/)
    * [Shortest Version](https://gist.github.com/cesarila/a58504fbc3924bcef6ae8ce83a652071)

### Building

Assuming you've satisfied the prerequisites, you can build the containers from the root directory of this repo with:
`docker compose build`
This only needs to be done on changes to entrypoint scripts, dockerfiles, and docker-compose.yaml. This includes changes made by people other than you.
If you don't want to think about it, always rebuild your containers after pulling from the repo.

### Running

Run containers in the foreground:

* `docker compose up`

Run containers in the background with logging visible:

* `docker compose up &`

Run containers detached from the current shell (no logging visible):

* `docker compose up -d`

### .env for Docker

Copy the `.env.example` file in the `/server` folder, and rename it to `.env`, change the contents to follow the convention below.
The `DATABASE_URL` field should be identical if the docker files are unchanged, and the `SERVER.HOST` should bind to `0.0.0.0` rather than `127.0.0.1` for running in a Docker container.

```txt
DATABASE_URL=postgresql://docker:docker@postgres/p2boards
SERVER.HOST=0.0.0.0
SERVER.PORT=8080
PROOF.RESULTS=500
PROOF.DEMO=200
PROOF.VIDEO=200
STEAM.API_KEY=
BACKBLAZE.KEYID=
BACKBLAZE.KEY=
BACKBLAZE.BUCKET=
RUST_LOG=1
RUST_LOG="actix_web=info"
```

### Troubleshooting Database

To rebuild the database volume from the database dump, do the following:

```bash
docker compose down # make sure all containers are stopped
docker volume rm portal2-cm-boards-v2_postgres_data
docker compose build
docker compose up
```

If this doesn't work for any reason, one thing to check is that the file copied in db/Dockerfile is the same as the dump in db/dbdump. If these files don't match, make them match, save your changes, and try the above steps again.

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
