# Backend changes (v2-redesign)

Everything this fork changes on the server side, compared with upstream
[p2sr/portal2-cm-boards-v2](https://github.com/p2sr/portal2-cm-boards-v2) (fork point `b08d996`). It covers the Rust web server
(`server/`), the database (`db/dbscript/`), the demo parser (`server/demo-parser/`) and the board's Steam fetcher service
(`backend/`). Frontend changes aren't listed here.

**Contents**

1. [Upgrading an existing database](#1-upgrading-an-existing-database)
2. [Configuration](#2-configuration)
3. [Accounts, staff roles and permissions](#3-accounts-staff-roles-and-permissions)
4. [Database changes](#4-database-changes)
5. [New API endpoints](#5-new-api-endpoints)
6. [Changed behaviour of existing endpoints](#6-changed-behaviour-of-existing-endpoints)
7. [Caching and performance](#7-caching-and-performance)
8. [Run submissions and demos](#8-run-submissions-and-demos)
9. [Games, seasons and linked leaderboards](#9-games-seasons-and-linked-leaderboards)
10. [Import and maintenance scripts](#10-import-and-maintenance-scripts)
11. [Backend service (`backend/`)](#11-backend-service-backend)
12. [Known gaps](#12-known-gaps)

---

## 1. Upgrading an existing database

New databases get everything from `db/dbscript/schema.sql`. An existing database needs the migrations in
`db/dbscript/migrations/`, applied **in filename order**:

| Migration | What it adds |
|---|---|
| `20261012000000_multi_game.sql` | Portal Stories: Mel as game 2 next to Portal 2; `legacy_changelog_ids` (old board id → changelog id per game); `changelog.autorender_id`. |
| `20261014000000_segments.sql` | `changelog.segments` (jsonb): SAR mtrigger segments per run, imported from autorender. |
| `20261015000000_auth.sql` | `sessions` (Steam sign-in sessions, token hashes only) and `openid_nonces` (replay guard). |
| `20261016000000_admin.sql` | `admin_actions` (audit log) and `users.frozen` / `frozen_reason`. |
| `20261017000000_roles_wr.sql` | `users.role` (verifier / moderator / admin) and `changelog.wr_hidden`. |
| `20261018000000_reactions.sql` | `run_reactions`: one thumbs up / down per user per run. |
| `20261019000000_reaction_events.sql` | `run_reaction_events`: append-only history of every reaction change. |
| `20261020000000_map_bsp_names.sql` | `maps.bsp_name` for all Portal 2 and Mel maps, so a demo's map file can be matched to a board map. |
| `20261021000000_games_seasons.sql` | Changelog indexes; map ids widened to 32 characters; `games.slug/kind/base_game_id/starts_at/ends_at/sort_order/hidden`; `chapters.sort_order`; `maps.sort_order/source_map`; `map_links`; `changelog.mirror_of`, `coop_bundled.mirror_of`; the linked-leaderboard functions and triggers. |
| `20261022000000_run_stats.sql` | `changelog.portals` (portal count from the demo's scoreboard), carried to linked copies. |
| `20261023000000_run_reports.sql` | `run_reports` (anonymous run reports). |
| `20261024000000_profile_overrides.sql` | `users.name_locked` / `avatar_locked` (staff-set names and pictures). |
| `20261025000000_drop_fullgame.sql` | Drops the full-game `fg_*` tables from databases that had the earlier full-game migration (the feature was removed). |
| `20261026000000_empty_chapters.sql` | Deletes Mel chapters without maps (the Mel board's empty Advanced "1952" chapter, imported as a second Story chapter). The importer now skips them. |
| `20261107000000_own_display.sql` | `users.avatar_custom`: a picture the player chose in Settings, kept through sign-ins. |
| `20261108000000_game_branding.sql` | `games.short_name` (the name beside the logo) and uploaded `logo_file` / `background_file` with their times. |
| `20261110000000_coop_partner_demo.sql` | `coop_bundled.partner_demo_id`: a co-op partner's demo of a run that wasn't a personal best for them (see [§8](#8-run-submissions-and-demos)); linked copies of a pairing carry it. |
| `20261111000000_changelog_newest_index.sql` | `idx_changelog_newest` (changelog by timestamp, newest first, undated last): Score Updates read the newest runs off it instead of sorting the whole table (~175 ms → ~4 ms). |
| `20261112000000_submit_keys.sql` | `users.submit_key_hash` / `submit_key_created`: SAR auto-submit keys, kept only as SHA-256 (unique index). The old boards' keys (`users.auth_hash`, imported) are hashed the same way, so they keep working, and their plaintext copies cleared. |
| `20261113000000_wr_webhooks.sql` | `games.wr_webhook_url` (each game's Discord webhook for WR announcements), `wr_announcements` (runs the announcer checked, so each is posted at most once) and `wr_announcer_state` (it starts after the newest run when the migration ran, so no old WR is posted). |

`import_boards.py` builds a fresh database from the old boards' MySQL dumps and runs the BSP-name step itself (see
[§10](#10-import-and-maintenance-scripts)).

## 2. Configuration

New environment variables for the server (dotted names, as in `server/.env.example`):

| Variable | Required | Purpose |
|---|---|---|
| `SERVER.PUBLIC_URL` | Production | Public address of the site, which serves the API under `/api` (e.g. `https://board.portal2.sr`). Steam sign-in returns here; session cookies are `Secure` when it's https; sign-in redirects other hosts to it. Default `http://localhost:3000`. |
| `SERVICE.TOKEN` | For `/backend` | Shared secret for the board's own services, sent as `X-Service-Token`. Unset = service access off (only signed-in staff can write). Also salts run-report reporter hashes. |
| `DEMO.PARSER` | For submissions | Path to `server/demo-parser/parse_demo.mjs` (run `npm install` in that folder). |
| `DEMO.STORAGE` | For submissions | Directory submitted demos are saved in. |
| `DEMO.NODE` | No | Node executable if `node` isn't on the PATH (Node 18+). |
| `SERVER.BEHIND_PROXY` | Production | `true` when a reverse proxy is in front: client addresses (rate limits, anonymous report de-duplication) are read from `X-Forwarded-For`. Off by default, since that header can't be trusted without a proxy. Bind `SERVER.HOST` to `127.0.0.1` behind the proxy so clients can't reach the server directly. |
| `SYNC.STEAM` / `SYNC.MINUTES` / `SYNC.RANK_LIMIT` | No | Pull new Portal 2 times from Steam's leaderboards: off unless `SYNC.STEAM=true`; every 10 minutes; times in each map's top 500 on Steam. See [§13](#13-steam-sync). |
| `RANKS.COOP` | No | How co-op runs are ranked: `run` (default) gives each run one rank, so the next team down is rank 2; `player` gives each player a rank, so a run fills two (1, 1, 3) as the old boards did. See [§6](#6-changed-behaviour-of-existing-endpoints). |
| `RANKS.COOP_PROOF_SINCE` | At launch | UTC time (`2026-11-01 00:00:00`) from which new co-op runs in the top 200 need a demo from each player; set it to when the site goes fully online. Unset = off (one demo verifies both halves). See [§8](#8-run-submissions-and-demos). |
| `DEMO.ARCHIVE` | For old demos | Folders holding the old boards' demo files (several separated by `;`, searched recursively). Needed for downloading imported runs' demos. |

`STEAM.API_KEY` (existing) is now also used to fill in names and avatars at sign-in, to create accounts for new co-op
partners, and to restore a player's Steam picture.

`server/.env.example`, `README.md` and `.gitignore` (`server/demos/`, `*.dem`) are updated to match.

## 3. Accounts, staff roles and permissions

- **Steam sign-in** (OpenID 2.0) replaces upstream's lack of user auth. `GET /auth/steam/login` → Steam →
  `GET /auth/steam/callback`, which checks the assertion with Steam (`check_authentication`), a state cookie and a
  one-time nonce, then creates a session. The session cookie `p2cm_session` is HttpOnly, SameSite=Lax; the database keeps
  only its SHA-256.
- **Request extractors** (`server/src/tools/auth.rs`): `MaybeUser` (optional), `SignedIn` (signed in, not banned),
  `AdminOrService` (any staff tier, or a valid `X-Service-Token`).
- **Writes from browsers** must come from the site's own origin (`Origin` header checked against `SERVER.PUBLIC_URL`).
- **Staff tiers** (`users.role`):

  | Tier | Can |
  |---|---|
  | Verifier | Moderation basics: hide/restore runs, verify or mark pending, WR history, co-op partner and colours, freeze profiles, read reports and the audit log. |
  | Moderator | The above, plus ban/unban profiles and set a profile's name and picture. |
  | Admin | Everything, plus change roles, delete runs, remove demos, manual run entries, and the games/maps editor. |

  `users.admin` (old board listing levels 1 standard, 2 shadow, 3 dev) is unchanged and only affects listings.
- **Every endpoint that changes data now needs a session or the service token**; upstream's write endpoints were open.
- **Audit log**: every staff action is written to `admin_actions` in the same transaction as the change (who, what,
  target, reason, before/after details).
- `/user` no longer returns `auth_hash` or `discord_id`.

## 4. Database changes

Beyond the migrations table above:

- **Indexes** on `changelog(map_id, score)`, `(profile_number)`, `(coop_id)`, `(timestamp)` and `coop_bundled(cl_id1)`,
  `(cl_id2)`. Before these, per-map queries scanned the whole changelog.
- **Pending runs** use the existing `changelog.verified` (`false` = pending), which is how the old boards' `pending`
  flag was imported.
- **Triggers** (from `games_seasons`) on `changelog` and `coop_bundled` keep linked copies of runs in step with the
  original: insert, update (ban, verification, demo, video, note, segments, portals), delete, and co-op pairing. They only
  act when a map is linked, so they cost nothing on unlinked maps. See [§9](#9-games-seasons-and-linked-leaderboards).
- **Co-op filler**: unpaired co-op runs are bundled with the placeholder user `N/A`, one placeholder run per co-op map.
  Games and seasons created in the editor get their own placeholders.

## 5. New API endpoints

All under `/api/v1`. Auth: **public**, **signed in**, **staff** (any tier or service token), **mod** (moderator or admin),
**admin** (admin tier or service token).

### Sign-in

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /auth/steam/login?return=` | public | Starts Steam sign-in. |
| `GET /auth/steam/callback` | public | Steam's return; creates the session and redirects back. |
| `GET /auth/me` | public | The signed-in user (id, name, avatar, role) or null. |
| `POST /auth/logout` | signed in | Ends the session. |

### Boards and runs

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /catalog` | public | Every game and season with chapters, maps (incl. links) and categories, in display order. Staff also see hidden games. The frontend loads this at startup. |
| `GET /points/game/{game_id}/{board}` | public | Aggregated points for any game; `board` = `overall`, a chapter `game_mode` (`sp`, `coop`, `story`, …) or `chapter-{id}`. Served from the points cache, gzipped when accepted. Each row has what the board pages show: `points`, `score`, `num_scores`, `user_name`, `avatar`, `country_id`. |
| `GET /ranks/game/{game_id}/{steam_id}` | public | A player's rank per map in a game. |
| `GET /profile/scores/{steam_id}?game_id=` | public | A player's PB per map of a game (default Portal 2); Portal 2's come with rank, delta to next and to WR. A co-op PB counts once both halves are verified and neither half nor player is banned, as on the co-op board and in points (a faster run with a banned partner isn't the PB, also when the partner has only the `N/A` placeholder half). Runs where the player has only the placeholder half count too, as on the board: the PB is then the partner's half. Co-op PBs name the partner (`partner_profile_number`, `partner_name`, `partner_avatar`; `N/A` when unknown). |
| `GET /profile/stats/{steam_id}?game_id=` | public | Stats: runs, maps completed, time saved, demo/video coverage, co-op partners (maps and runs together), portal counts. |
| `GET /profile/points_history/{steam_id}?game_id=` | public | A player's real points over time: at each date (weekly or wider, up to ~160 points) every map's rank is recomputed against everyone's best times then, so being passed shows as a drop. The last point equals the current boards. Undated imported runs count from Portal 2's release, but the chart starts at the player's first dated run. |
| `GET /profile/at/{steam_id}?at=&game_id=` | public | Where a player stood at a past moment (`at` = a day, as of its end in UTC, or an ISO time): points and global place per board, and their best time, rank and points on each map then, ranked against everyone's times as of then (same rules as the points history). The profile's points chart links here (click a day). |
| `GET /profile/aggregated/{steam_id}?game_id=&at=` | public | The player's place on every aggregated board (each chapter, each mode, overall), now or as of `at`: points (rank, points, gap to the next player up and to first) and time (the same, on boards where they have a time on every map), like the old boards' "aggregated times and points". Worked out from the same run timeline as `/profile/at`, so today and a past day agree; each moment's totals are cached (cleared when runs change). |
| `GET /map/sp/{id}?at=`, `GET /map/coop/{id}?at=` | public | `at` (a day or an ISO time, UTC) gives the map's board as it stood then; undated imported runs count from release. The WR history chart links here (click a record). The board goes down to rank `PROOF.RESULTS` (500) and keeps everyone tied at it, so it can run a few rows past 500 (runs tied across the cutoff used to be dropped, with no rank on the board or the profile); the rank cache follows the same rule (cache files from before are rebuilt). |
| `GET /profile/points_peak/{steam_id}?game_id=` | public | A player's highest points per board (`sp`, `coop`, …, `overall`) with the date reached. Exact, with the ranking of the points-over-time chart: checked at each of the player's runs and, in co-op (ranked by run), at each moment a run faster than theirs dropped out (two players whose bests were separate runs pairing up), when they move up without running. Never below the player's points now (from the points boards): where the run history and the boards disagree (a co-op run whose halves are paired into different bundles counts twice in the history), the points now are the peak, dated today. |
| `GET /users/search?q=` | public | Up to 10 players by name or Steam ID, most active first. |
| `GET /user/submit-key` | signed in | Whether you have a SAR auto-submit key (`has_key`, `created`); the key itself is never shown again. |
| `POST /user/submit-key` | signed in | Makes you a new SAR auto-submit key (the old one stops working) and answers it once (`{ "key" }`, `Cache-Control: no-store`). 10 an hour per address. |
| `DELETE /user/submit-key` | signed in | Removes your auto-submit key. |
| `GET /staff` | public | Everyone with a staff role who isn't banned (id, name, avatar, `role`), admins first, then moderators, then verifiers, each by name. The About page's team list. (`GET /admins` still lists by the old `users.admin` number, which setting a role doesn't change.) |
| `GET /recap/weekly?week=&game_id=` | public | The week's top 5 runs (best rank, then biggest improvement; one per player per map). |
| `GET /daily?date=&game_id=` | public | That day's daily chambers (one map per board, picked from a hash of the date) and the times set on them. |
| `GET /changelog/{id}` | public | One run by id, in the same shape as a `GET /changelog` row, from any game; 404 for an unknown id (the run page, `/run/{id}`). |
| `GET /changelog/{id}/segments` | public | A run's mtrigger segments. |
| `GET /coop/{coop_id}/halves` | public | Both halves of a co-op run (for the run details toggle). |
| `GET /runs/{id}/reactions` | public | Thumbs up / down counts. |
| `GET /runs/reactions/mine?ids=` | public | The signed-in user's reactions on several runs. |
| `PUT /runs/{id}/reaction` | signed in | Set or clear your reaction (also logged to `run_reaction_events`). |
| `POST /runs/{id}/report` | public | Report a run anonymously (reason + details). |
| `POST /submissions/preview` | signed in | Read a demo (multipart `demo`): map, time, players, matching board maps. Saves nothing. |
| `POST /submissions` | signed in | Submit a run from a demo; admins may also enter map/time/player/partner by hand. See [§8](#8-run-submissions-and-demos). |
| `GET /demos/{id}/file` | public | Download a run's demo (as an attachment, cached a day). Looked up in `DEMO.STORAGE`, then `DEMO.ARCHIVE`. See [§8](#8-run-submissions-and-demos). |
| `POST /runs/{id}/demo` | signed in | Add the demo for a pending run (its player, co-op partner or staff); checked against the run, then verified. |

### Staff

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /admin/audit?kind=&action=&q=&before=&limit=` | staff | The audit log; `kind` = `runs`, `profiles` or `catalog`; `q` searches names (staff, player, co-op partner, profile), map names, reasons and catalog details (ignoring case), or matches a run id, Steam id or target id exactly. |
| `GET/PUT /admin/games/{id}/webhook` | admin tier | A game's Discord webhook for WR announcements: `GET` answers `{ set, url }` with the token hidden; `PUT { "url" }` sets it (Discord webhook addresses only) or removes it (`null`). Never in `/catalog`; the audit log notes the change, not the address. |
| `POST /admin/games/{id}/webhook/test` | admin tier | Sends a test message to the game's webhook (5 a minute). |
| `PUT /admin/runs/{id}/banned` | staff | Hide a run from the boards / restore it (both co-op halves). |
| `PUT /admin/runs/{id}/verified` | staff | Verify a pending run / mark it pending. |
| `PUT /admin/runs/{id}/wr_history` | staff | Remove from / restore to the map's WR history. |
| `PUT /admin/runs/{id}/partner` | staff | Set a co-op run's partner by SteamID (creates the account from Steam if needed). |
| `PUT /coop/{coop_id}/host` | staff | Record which co-op player hosted (played blue). |
| `GET /admin/runs/{id}/reactions` | staff | Who reacted and the full reaction history. |
| `PUT /admin/users/{id}/freeze` | staff | Freeze / unfreeze a profile (times stay, no new ones). |
| `GET /admin/reports?status=&before=` | staff | Run reports (`open` by default) with the reported run. |
| `GET /admin/reports/count` | staff | Open report count. |
| `PUT /admin/reports/{id}` | staff | Resolve, dismiss or reopen a report (optionally every report on the run). |
| `PUT /admin/users/{id}/banned` | mod | Ban / unban a profile (hides all runs, ends sessions; staff must lose their role first). |
| `PUT /admin/users/{id}/display` | mod | Set the shown name and/or picture (`default`, `steam` or an https address); locked against sign-in and the player's own changes. |
| `PUT /admin/users/{id}/role` | admin | Set a staff tier. |
| `DELETE /admin/runs/{id}` | admin | Delete a run permanently (both halves, its demo rows, pairing). |
| `DELETE /admin/runs/{id}/demo` | admin | Remove a run's demo. |

### Games and maps editor (admin)

| Method & path | Purpose |
|---|---|
| `POST /admin/games` | Create a game, or a season (`base_game_id`, `starts_at`, optional `ends_at`, `link_to_base` default true). |
| `PUT /admin/games/{id}` | Rename, change link name, hide/show, move a season's dates. |
| `DELETE /admin/games/{id}` | Delete a game or season without runs of its own. |
| `PUT /admin/games/{id}/layout` | Save chapter order and which chapter each map is in (drag and drop). |
| `POST /admin/games/{id}/chapters`, `PUT`/`DELETE /admin/chapters/{id}` | Add, rename / change board, delete (empty only). |
| `POST /admin/chapters/{id}/maps`, `PUT`/`DELETE /admin/maps/{steam_id}` | Add a map (with main category and co-op placeholder), rename / map file / main category, delete (no runs only). |
| `POST /admin/maps/{steam_id}/categories`, `PUT`/`DELETE /admin/categories/{id}` | Categories. |
| `POST /admin/maps/{steam_id}/links`, `DELETE /admin/maps/{a}/links/{b}` | Link / unlink two maps of different games. |
| `POST /admin/games/{id}/links`, `DELETE /admin/games/{id}/links/{other}` | Link / unlink every matching map of two games. |

## 6. Changed behaviour of existing endpoints

- **Ranks and points** (`/ranks/game`, the points boards and profiles' points): a co-op run counts for a player the bundle
  names even when their half is the `N/A` placeholder (only their partner's half was sent in), as the co-op board and
  `/profile/scores` already did. Times don't change; those runs now add to the player's points.
- **`GET /changelog`** gains `game_id`, `verified` (`false` = only pending), `include_hidden_wr`, `max_rank` (runs that ranked that high or better when set, e.g. 100) and `since_days` (runs from the last N days), and returns per row:
  co-op blue/orange players (host first), whether the colours are known, reaction counts, `wr_hidden`, `portals`.
  With `wr_gain=true` it now leaves out runs removed from WR history, banned runs, runs by banned players and pending runs.
- **`POST /sp/post_score`** (the backend's insert): when `verified` isn't given, a run without a demo that would rank in
  the top 200 is stored as **pending**. Frozen profiles are refused (409).
- **`PUT /changelog/demo`** (backend attaching a demo): verifies the run if it was pending.
- **`GET /map/sp/{id}`, `/map/coop/{id}`** work for any game; the game is taken from the map unless `game_id` is given.
  Unknown maps no longer panic.
  Each entry also carries the demo's `portals` and `sar_version` (co-op: `portals1` / `portals2`, `sar_version1` /
  `sar_version2`, one per half), so a run opened on a map page shows them as Score Updates does.
- **`GET /coop/{coop_id}/halves`** adds each half's `portals` and `sar_version`.
- **`GET /coop`** (previews) takes `game_id`.
- **`GET /sp` and `GET /coop` previews** (the Maps page cards) list the same runs in the same order as the map's
  board: each player's best verified run in the map's main category, equal times in the order they were set (the
  earlier one is the record). They used to sort by time alone, so ties came out in any order, and the SP ones also
  counted pending runs and other categories. Each run carries its `demo_id` (co-op: either half's, or the partner
  demo of a half without a run of its own), so the cards offer the demo for download as the old boards did.
- **`GET /user/{id}`** adds `frozen`, `role`, `name_locked`, `avatar_locked`; drops `auth_hash`, `discord_id`.
- **Sign-in and `PUT /user/avatar/{id}`** leave staff-set pictures alone.
- **Changes to runs** (posting, editing, moderation) invalidate the points cache and previews.
- **Co-op ranks by run** (`RANKS.COOP`, default `run`): each co-op run takes one rank, so after a tied pair at rank 1
  the next team is rank 2 (it was 3, as each player took a rank). Runs with the same time share a rank. This applies
  to points and aggregate boards, profile ranks, the points-over-time chart, the rank stored with new submissions and
  the co-op map page (which already numbered runs, now with ties shared). Both halves of a run are recognised by their
  shared `coop_id`. `RANKS.COOP=player` restores the old ranking everywhere; the rank cache file is rebuilt when the
  setting changes. Ranks stored on past runs (`pre_rank` / `post_rank`) aren't rewritten.
- **Half-verified co-op runs**: a co-op run only counts for points, profile ranks, the points chart and submission ranks
  once both halves are verified and neither half nor either player is banned, the rule the co-op map page already used.
  Before, a pending partner half still let the verified half count.

## 7. Caching and performance

- **Points cache** (`server/src/tools/points_cache.rs`): personal bests and ranks per game, held in memory. Boards are
  derived from it, with their JSON and a gzipped copy. Any run change drops it, and it's rebuilt in the background 3 s
  later, so a burst of changes means one rebuild. It's also rebuilt when older than 10 minutes, and warmed at startup for
  Portal 2 and Mel. The overall board went from ~1.8 s to ~5 ms.
- **Compression** middleware on all responses.
- The **changelog indexes** in [§4](#4-database-changes), plus migration `20261027000000_perf_indexes.sql`: a
  `pg_trgm` index on player names for search (`/users/search` went from a full scan of `users` to an index lookup; it
  now also only counts runs for the candidates it ranks). A partial index on each player's qualifying runs was tried
  for the points-cache query and made it slower (the planner used it for a nested loop instead of hash joins), so that
  query is unchanged; `ANALYZE` after a big import keeps its plan sensible.
- **Sessions**: a request only refreshes `sessions.last_seen` when it's more than ten minutes old, so the usual
  signed-in request is one read, not a write.
- **Points history and peak** results are cached per player and day alongside the run timeline (dropped with it when
  runs change), so repeat profile views don't recompute them.
- **Demo downloads** stream from disk through `actix-files` with ETag / Last-Modified (304s) and range requests, instead
  of reading the whole file into memory.
- The points cache's safety refresh is hourly (it was every 10 minutes; every run change already rebuilds it).
- **Smaller aggregated boards** (`GET /points/game/...`): rows leave out the rank sum and best/worst map (the board
  pages don't use them; the server keeps them), and the stored gzip copy uses the strongest level (it's built once
  per rebuild, ~50 ms more for the overall board). The Portal 2 overall board went from 824 KB to 514 KB per
  download, single player and co-op from ~470 KB to ~295 KB.
- **`GET /graph`** (runs per day on the score updates page) is cached for two minutes per time zone: it counted
  every run (~240 ms) for every visitor; a cached answer takes ~10 ms.
- **`GET /profile/{id}`**: the oldest/newest personal bests are one query instead of four (~70 ms → ~28 ms), and come
  from the player's own run: the old queries matched any run with the same timestamp, so a season copy of a map or
  another run at that second could be shown instead.
- **`GET /stats/count_scores`** (and `/{map_id}`) no longer fails (500) when a player has no name or picture.
- **Rank cache reloads can't crash the server** (`CacheState::reload_rank` in `server/src/tools/cache.rs`): a failed
  board read (e.g. a pool timeout under load) is retried once after 500 ms, then logged, and the map keeps its old
  ranks until its next change or the next start. Maps added since startup get their category from the database.
  Before, either case panicked.

### Hardening

- **Client addresses can't be spoofed** (`server/src/tools/ratelimit.rs`): behind a proxy the server takes the last
  `X-Forwarded-For` entry, the one the proxy in front added. Before, actix's `realip_remote_addr()` preferred a
  `Forwarded: for=` header, which clients could send themselves to get a fresh allowance from every rate limit and
  from the SAR auth-failure lockout on each request. nginx now also drops client `Forwarded` headers.
- **Staff tiers**: changing a player's country (`PUT /admin/users/{id}/country`) is for moderators and admins, like
  names and pictures (any staff tier could before); staff can't freeze or unfreeze themselves, and only admins can
  freeze or unfreeze other staff.
- **`Cargo.lock` is committed** (server and backend) and the server's Docker build uses it (`cargo build --locked`).
  Before, every deploy resolved its dependencies afresh, so builds weren't reproducible and any new release of a
  dependency went live unreviewed. Update them with `cargo update`, test, and commit the lockfile.
- **Rate limits** (`server/src/tools/ratelimit.rs`), per client address: Steam sign-in 20/min, demo uploads (preview,
  submit, add demo) 10/min, run reports 10/hour, player search 60/min, points history/peak 60/min, demo downloads
  120/min. Over the limit answers 429 with `Retry-After`.
- **Errors**: clients get a short generic message (`Not found.`, `Something went wrong on the server.`); the real
  error is logged. Before, raw database errors (table and column names) were returned.
- **`GET /chapters`** binds its `chapter_name` filter as a parameter (it was pasted into the SQL).
- **`GET /changelog`** caps `limit` at 5000.
- Response headers `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Strict-Transport-Security` when the
  public URL is https.

## 8. Run submissions and demos

- `server/demo-parser/parse_demo.mjs` (Node, `@nekz/sdp`) reads a demo: map file, client, the end-of-run challenge mode
  scoreboard (time in centiseconds, portal count), and the players. Players come from the userinfo string table plus a scan
  of the whole file, which also finds a co-op partner who joined after recording started. The server runs it with a 30 s
  timeout.
- Uploads are handled four at a time (`tools/upload_slots.rs`): every upload endpoint (`POST /submissions/preview`,
  `POST /submissions`, `POST /runs/{id}/demo`, `POST /api-v2/auto-submit`) takes a slot before reading the demo and keeps it
  until it answers, so at most four demos sit in memory and four parsers run at once. An upload waits up to 15 s for a slot,
  then gets 503 (`Retry-After: 30`, "The server is busy checking other demos").
- **`POST /submissions`**:
  - The map comes from the demo's map file (`maps.bsp_name`; season copies excluded) and the time from the scoreboard.
  - Players can only submit demos they're in.
  - The co-op partner is the other player in the demo, and is created from Steam if they have no account yet.
  - Admins can override map, time, player and partner, with or without a demo. Those entries are audit-logged as
    `run.manual_submit`.
  - Demos are capped at 50 MB and saved to `DEMO.STORAGE` as `{map}_{time}_{steamid}_{random}.dem`.
  - Each board only takes improvements. The run goes on the submitted map if it beats the player's best there, otherwise
    on the first linked board where it does, and it's refused if it improves none.
  - The response lists every board it counted on.
- **Pending proof**: `POST /runs/{id}/demo` checks the demo's map, exact time and that the run's player is in it, then
  attaches it and verifies the run (both co-op halves).
- **Co-op proof from both players** (from `RANKS.COOP_PROOF_SINCE`; off while unset): a co-op run that ranks in the
  top 200 stays pending for both players until each has added their own demo, then both halves are verified together.
  A run whose partner isn't known stays pending (staff can set the partner or verify it). The partner adds their demo
  by submitting it (it pairs with the run) or with **Add demo** on their own half; `POST /runs/{id}/demo` puts a
  partner's demo on their half and answers `{ "verified": bool }`, and `POST /submissions` returns
  `waiting_for_partner`. Runs from before the cutoff keep the old rule. Staff can still verify by hand.
- **Partner demos** (both players' views of every co-op run): when only one player of a co-op run improved, the other
  has no changelog entry in it (their slot is the map's placeholder), so Submit Run refuses their demo as not a
  personal best. They add it with `POST /runs/{id}/demo` instead, also once the run is verified: same checks (map,
  exact time), they must be in it, and it can't be the same file as the other player's demo. It's kept as the run's
  partner demo (`coop_bundled.partner_demo_id`; its `demos.cl_id` is the run's own entry) and shows as that player's
  `demo_id` in `GET /coop/{id}/halves` and in the co-op map board's `demo_id1` / `demo_id2`. Under the co-op proof
  rule it counts as that player's demo, so such runs can be verified without staff. Removing the run's demos (or the
  run) removes it too; staff setting a different partner, or pairing the partner's own run in, drops it. The
  background demo reader reads it like any other demo.
- **Downloads** (`GET /demos/{id}/file`): submitted demos are read from `DEMO.STORAGE` by `demos.file_id`. Imported demos
  come from the `DEMO.ARCHIVE` folders, indexed by file name once at startup (`server/src/tools/demo_files.rs`; ~185k
  files). The old boards named those files `Map_score_steamid_N.dem` with their own id as N: for Portal 2 that's the
  changelog id, so `{prefix}_{changelog id}.dem` is tried; for Mel the id isn't kept, so the file is found by
  `Map_score_steamid` when only one file has it. Against the local archive this finds 182,135 of 182,364 demos (57
  Portal 2 and 172 Mel files are missing or ambiguous).

### SAR auto-submit (`/api-v2`)

SAR's challenge mode auto-submit (p2sr/SourceAutoRecord, `src/Features/AutoSubmit.cpp`) talks to the old boards'
`/api-v2`; `server/src/api/v2` answers the same requests the same way (p2sr/Portal2Boards, `classes/Router.php`), at the
site root as SAR expects (nginx passes `/api-v2/` to the server). Every endpoint is a `POST` with a multipart form
carrying `auth_hash`, the player's submit key (Settings → SAR auto-submit; SAR reads it from `autosubmit.key`):

| Path | Answers |
|---|---|
| `validate-user` | `{ "userId" }` for a working key. |
| `current-pb` (`mapId`) | The player's verified, unbanned best there, score as a string (`{}` without one): a time still waiting for its demo doesn't stop SAR submitting it. |
| `top-scores` (`mapId`, `before`, `after`, each ≤ 10) | The board around the player (or its top when they aren't on it), `userData` / `scoreData` with strings, for SAR's in-game list. |
| `download-maps` (optional `game`: `mel` / `portal2`) | `{ "maps": [{ "level_name", "id" }] }`; without `game`, `mel.` hosts get Mel's maps (SAR has Portal 2's built in). |
| `auto-submit` (`mapId`, `score`, `demoFile`) | Records the run as `submission` 2 (the old boards' auto-submit marker), checked like Submit Run: the demo of that map, with that time (±0.01; the demo's own time is recorded), with the key's owner in it. When the Steam sync already recorded the same time without a demo, the demo goes on that run instead of a second entry. |

Hardening: keys are 128 random bits, stored only as SHA-256; wrong keys count against the client's address and lock it
out after 20 in 10 minutes; every endpoint is rate limited (120 a minute) and uploads 10 a minute; only `auto-submit`
takes a file, and it checks the key when the file starts (so the key must come first, as SAR sends it) rather than
buffering an upload from a client without one; field count and sizes are capped; banned accounts' keys don't work,
frozen profiles can't submit, and in staff-only mode only staff players' keys work (the private-mode gate lets
`/api-v2/` through to these checks). SAR only submits to `board.portal2.sr` / `mel.portal2.sr` (it ignores other
addresses in `autosubmit.key`), so stock SAR reaches these boards once they're served there.

## 9. Games, seasons and linked leaderboards

- **Games** have a link name (`slug`, e.g. `portal2`, `mel`), a display order and can be hidden. Chapters have a board
  key (`game_mode`); boards of games other than Portal 2 and Mel are addressed as `{slug}-{game_mode}` by the frontend.
- **Seasons** copy a base game's chapters, maps (`s{season id}-{steam id}`, `source_map` → original) and main
  categories, and have a UTC start and optional end.
- **Linked maps** (`map_links`): a run set on one map is also recorded on each linked map where it beats the player's
  verified best there. These are mirror rows with `mirror_of` pointing at the original, a rank computed on that board,
  and their own previous-best and delta.
  - Linking doesn't copy existing times.
  - A link applies from when it was created, and links to a season's map only inside the season's dates.
  - Only main-category runs carry over.
  - Mirrors aren't mirrored again: links aren't transitive.
- The triggers keep mirrors in step with the original, so all existing board queries (map boards, points, profiles, score
  updates, weekly recap, daily chambers) work for seasons with no per-query changes. Reports on a mirror go to the
  original.

## 10. Import and maintenance scripts

In `db/dbscript/` unless noted:

| Script | Purpose |
|---|---|
| `import_boards.py` | Builds the database from the old Portal 2 and Mel MySQL dumps: users (Mel-only bans kept per board), runs, co-op pairs, legacy ids, games with slugs, BSP names, staff roles from the old admin flag. `--demo-players` pairs co-op partners found in demos (hosts → blue). |
| `parse_demo_players.py` | Reads both players (and the host) out of every co-op demo in the archive (~3 min for 178k demos). |
| `import_autorender.py` | Copies autorender video ids and mtrigger segments onto runs (clears dead ids). |
| `server/demo-parser/demo_stats.mjs` | Reads the scoreboard (time, portals) from an archive of demos in parallel → CSV (~45 min for 178k). |
| `import_demo_stats.py` | Loads those portal counts into `changelog.portals` (only where the demo's time matches the run). |

## 11. Backend service (`backend/`)

- Sends `X-Service-Token` (from `SERVICE_TOKEN` in `backend/.env`) on every request to the server, via shared HTTP
  clients in `backend/src/http.rs`. The token must match the server's `SERVICE.TOKEN`.
- Build fix: `chrono` without the removed `rustc-serialize` feature.

## 13. Steam sync

Challenge mode uploads each player's best time per map to Steam's leaderboards (a map's `steam_id` is its leaderboard
id), which is how the old boards were fed. `server/src/tools/steam_sync.rs` does the same inside the server: every
`SYNC.MINUTES` it reads the top of each Portal 2 map's leaderboard and records every time that beats what the board has
for that player. Rules:

- Only players in the map's top `SYNC.RANK_LIMIT` (500, the old board's window) on Steam count, ranked among valid
  entries (ties share a rank). Non-positive scores (hacked uploads show as -2147483648) and banned players don't take a
  place. Frozen players are skipped, as is any time the player already has on the map (so a banned time isn't pulled
  back) and anything that isn't an improvement.
- **First pass per map is a baseline that adds nothing.** It only records what Steam shows. Steam's leaderboards
  carry no dates, and the old board leaves some Steam times out on purpose, so a time the board doesn't have by then
  is never pulled in. After that, only entries whose score changed on Steam since the previous pass are considered,
  and a new run is dated when seen. A run staff remove later stays removed unless the player improves again. State is
  in `steam_sync_maps` (fingerprint per map) and `steam_sync_entries` (each player's score as last seen), migration
  `20261028000000_steam_sync.sql`. A pass sees each player's latest best, so several improvements within one interval
  show as one run.
- Only public maps are read; the old board's hidden maps (Portal Carousel, Wakeup, Container Ride, ...) have no Steam
  leaderboard.
- Times go through the same path as site submissions (`insert_run`): `submission = 0`, pending when they'd rank in the
  top 200 (no demo), linked boards honoured, co-op pairs formed when two new entries share a score (else the map's
  placeholder partner, fixed later by a demo or staff). Unknown players get an account from the Steam Web API.
- A map whose leaderboard hasn't changed since the last pass is skipped; after a pass with new runs the rank cache,
  previews and points cache are refreshed.
- `POST /admin/steam_sync` (staff / service token) runs a pass now and returns what it did; `?map_id=` limits it to
  one map, for trying it out before a full pass.
- Portal Stories: Mel has no public Steam leaderboards, so Mel times come from submissions (and, until it's retired,
  the old Mel board, below). The old `backend/` fetcher service is no longer needed for this.

### Countries

Players set their own name and picture in Settings (`PUT /user/display`: `name` or null for their Steam name, `avatar` as
`default`, `steam` or an https address); refused for whatever staff have set and for a name another player goes by. A
picture by address has to be on Steam's image servers or Imgur's (`moderation::AVATAR_HOSTS`: `avatars.steamstatic.com`
and its CDN variants, `steamcdn-a.akamaihd.net`, `steamuserimages-a.akamaihd.net`, `images.steamusercontent.com`,
`i.imgur.com`), for staff setting someone's picture too: visitors' browsers load avatars straight from their address, so
any other server would let whoever runs it log everyone who sees the player. Anything else answers 400.

Players set their own country (`PUT /user/country`, or `POST /user/country/steam` to take it from their public Steam
profile); staff can set anyone's (`PUT /admin/users/{steam_id}/country`, in the audit log). The points boards carry
each player's `country_id`, profiles get `country_place` (rank among players of the same country), the aggregate
boards can be filtered by country (`?country=us`), and `GET /countries/stats?board=overall|sp|coop` lists each
country's player count, points together and best players for the Countries page.

### Estimated dates for undated runs

About 40,600 imported Portal 2 runs had no date on the old board. Each now has the date of the last dated run before it
in the same game (runs were added in id order), flagged with `changelog.date_estimated` (migration
`20261106000000_estimated_dates.sql`; the changelog returns `date_estimated`, and run details show "About <date>
(estimated)"). Boards as they stood on a past date, points history and Legends then place them where they were added
instead of at Portal 2's release. To undo: `UPDATE changelog SET timestamp = NULL, date_estimated = false WHERE
date_estimated;`.

### Staff inbox

Staff get an inbox next to their avatar: `GET /admin/inbox` returns the latest 20 audit-log entries, `unread` (entries
after the last one the viewer saw, not counting their own) and `seen_id`; `PUT /admin/inbox/seen` with `{"id": n}`
marks it read up to that entry (stored in `users.staff_inbox_seen_id`, migration `20261104000000_staff_inbox.sql`, so
it follows the account across devices). Audit-log entries about a profile now carry `target_name`.

The inbox updates live. A trigger announces each new audit-log entry (`NOTIFY staff_inbox`, migration
`20261105000000_staff_inbox_notify.sql`, so entries from anything count: staff, the syncs, scripts) and
`server/src/tools/staff_events.rs` listens for it. Browsers long-poll `GET /admin/inbox/wait?after=<newest id>&seen=<seen_id>`,
which answers `{"changed": true}` as soon as there's a newer entry or the inbox was read in another tab, else 204 after
25 s. Long polling rather than server-sent events because Cloudflare's quick tunnels hold back streamed responses; it
works behind any proxy. The inbox also reloads every 5 minutes as a fallback.

New run reports are written to the audit log too (`report.new`, from nobody since reports are anonymous; the reason and
the reporter's words in `reason`, `{"report_id", "reason"}` in `details`), so they reach the inbox live and count as
new for every staff member. `GET /admin/inbox` also returns `open_reports`, shown as a second (amber) count that stays
until the reports are dealt with.

### Game modes

A game's modes (boards, each chapter's `game_mode`) can be added and renamed in the games editor: `PUT /admin/games/{id}`
with `{"mode_name": {"mode": "sp", "name": "No hair"}}`. A mode can be added before any chapter is in it; an empty
name goes back to the default name (e.g. Singleplayer), or removes a mode no chapter uses. Chapters are put in a mode
when they're added or edited.
Names are stored in `games.mode_names` (migration `20261103000000_mode_names.sql`), returned on each catalog game
as `mode_names`, and logged with the game's other edits.

### Map images

The admin tier can give any map its own image in the games editor (`POST /admin/maps/{steam_id}/image`, form field
`image`: PNG, JPEG or WebP up to 5 MB; `DELETE` goes back to the site's built-in image). Files are kept in
`IMAGES.STORAGE` (migration `20261101000000_map_images.sql`), served at `GET /maps/{steam_id}/image?v=` and cached for
good since the catalog's `image_version` changes with each upload. Uploads and removals are in the audit log.

**WR announcements** (`server/src/tools/wr_webhooks.rs`), like the old boards' and the Mel board's Discord WR webhooks,
but one webhook per game, seasons included (set in the games editor), so Portal 2, Mel and every other game post to
their own channels. Every 30 s the server checks newly verified runs: a run that holds rank 1 on its map (ties
count; banned players' runs and the co-op `N/A` placeholder don't) is posted to its game's webhook as the old embed
(map with its page and thumbnail, "WR: time (-improvement)", "By" with profile links; both players for co-op, one
post), with mentions turned off. Each run is checked once; a post Discord can't take right now is retried, one it
refuses isn't. Runs from the old boards' sync are never posted (the old boards announce those), and nothing from
before the migration is. Games without a webhook post nothing.

Games have the same for their header branding: `POST /admin/games/{id}/images/logo` or `.../images/background`
(form field `image`, same limits; `DELETE` goes back to the site's built-in one), served at
`GET /games/{id}/images/{logo|background}?v=`. `PUT /admin/games/{id}` takes `short_name` (the name beside the logo,
up to 16 characters; null or empty = the site's default), and the catalog gives `short_name`, `logo_version` and
`background_version` for each game.

### Staff-only mode

`SERVER.PRIVATE=true` (`server/src/tools/private_site.rs`) makes the site private while staff test it: every API
request needs a signed-in staff account (verifier, moderator or admin) or the service token, else 401/403. Steam
sign-in (`/auth/...`) and `GET /site` (`{ "private": bool }`) stay open, and the frontend shows non-staff a sign-in
page instead of the site (`components/PrivateGate.jsx`).

### Read-only mode

`SERVER.READ_ONLY=true` (Coolify: `READ_ONLY`), for the first days after opening: everyone can read, but any request
that changes something (not GET / HEAD / OPTIONS) needs a signed-in staff account or the service token, so players
can't submit runs or demos, react, report or change their settings while staff and the Steam sync carry on. Refusals
are 403 with "The boards are read-only for now: only staff can make changes." Sign-in and sign-out (`/auth/...`) stay
open, and SAR's `/api-v2` checks it itself (its key checks only read and keep working; `auto-submit` is staff-only).
`GET /site` reports it (`{ "private", "read_only" }`); the site then shows a banner and hides what would fail. Same gate
as staff-only mode (`server/src/tools/private_site.rs`).

### Link previews

Shared links show a card in Discord, Slack, Twitter and the like. Their bots don't run the app, so nginx
(`frontend/nginx.conf`) sends a link-preview bot (by user agent; search engines aren't on the list) that asks for a page
to `GET /link_preview` instead, with the page's path in `X-Original-URI`. Files such as the share image go to it as
they are. The server answers a small HTML page with the Open Graph tags, its URLs from `SERVER.PUBLIC_URL`:

- A player's profile (`/profile/{id}`): their name, Steam avatar, overall place and points, and single-player and
  co-op places (Portal 2's boards, from the points cache). Unknown and banned players get the site's card.
- Every other page: the site's card with the share image (`frontend/public/og-image.jpg`, or `og-image-preview.jpg`
  with a PREVIEW tag while `SERVER.READ_ONLY` is on).

The endpoint is open in staff-only mode too, but then only ever shows the site's card. Rate limited to 60 a minute per
address.

### Demo parsing

`server/src/tools/demo_parse.rs` reads every demo the boards have with `server/demo-parser/parse_batch.mjs` (many at
once, in parallel) and stores what's in it on `demos` (migration `20261030000000_demo_parse.sql`): the scoreboard time
and portal count, the players, who hosted a co-op run, the SAR version and build checksum, SAR's split times, and its
record of pauses and timescale cheats. Each demo is read once (`parsed_at`): new submissions, demos pulled from the
old boards and restored demo files are picked up as they come, and the archive is worked through in batches, newest
first. On by default when `DEMO.PARSER` is set; `DEMO.AUTO_PARSE=false` turns it off. The parser uses
`DEMO.PARSE_WORKERS` threads (4 by default) and runs at idle priority on Windows, so it only takes spare CPU.

From what's read, when the demo's scoreboard time is the run's own time:
- the run gets its portal count and split times (`changelog.portals`, `changelog.segments`) when it has none;
- a co-op run paired with the placeholder partner gets the partner the demo shows, and who hosted (played blue) is
  set when it wasn't known; `demos.partner_name` is the partner's name in the demo.

SAR version: SAR echoes its version into the console when it starts recording (`echo "SAR 1.15.5 (Built ...)"`) and
demos keep console commands, so newer demos name it. SAR also appends the CRC32 of its own binary after the demo's
stop message (`demos.sar_checksum`; it equals the CRC32 of that release's `sar.dll` / `sar.so` on GitHub), so an
older demo without the echo gets the version another demo with the same checksum echoed. `sar_approved` is true when
the checksum is on the old boards' list of approved builds (`demo-parser/checks/sar_whitelist.txt`, from their demo
checker, mdp, which ends at Oct 2025), else unknown.

`POST /admin/demo_parse?limit=` (staff / service token) reads a batch now; `?runs=1,2,3` reads those runs' demos again.

### Pulling from the old boards (until they're retired)

While board.portal2.sr and the Mel board are still in use, `server/src/tools/old_boards_sync.rs` pulls what Steam can't
tell us: Mel runs, demo and video submissions, comments, autorender videos and staff decisions. It runs at
`SYNC.OLD_BOARDS_HOURS` in `SYNC.OLD_BOARDS_TZ` (midnight and noon, America/Chicago, by default) when
`SYNC.OLD_BOARDS=true`. Each pull reads the board's `/changelog/json` from `SYNC.OLD_BOARDS_DAYS` (3) days back, or
from a day before the newest run we have from it if that's older. Per entry:

- **A run we already have from that board** (`legacy_changelog_ids`) gets what changed there since the last pull:
  banned, pending, video, comment, autorender, plus a demo it's missing. "Changed" is judged against the entry as last
  seen (`old_board_runs`, migration `20261029000000_old_boards_sync.sql`), so a decision our staff made here isn't
  undone unless the old board changes it too. On first sight only blanks are filled.
- **A run we have but not from that board** (the Steam sync's copy: same player, map and time within two days) is
  linked to it and takes the old board's date, ranks and status.
- **Anything else is added** as the old board has it: its date, ranks, status, comment, video and demo. Co-op halves
  are paired as the import paired them (same map and time, set within three hours), else with the map's placeholder.
- Demos are downloaded through the board's `getDemo` into `DEMO.STORAGE`, keeping the archive's file name.
  A download that fails is tried again after a wait that doubles each time (half an hour, an hour, two, ... up to a
  day), so a broken demo isn't asked for every pull. The report counts those as `demos_waiting`.

With `SYNC.OLD_BOARDS_MINUTES` (off unless set; e.g. 15), the schedule also makes a quick pull every so many minutes
in between the hours. A quick pull does everything above but fetch the backlog of demo files we have a record of and
no file for (up to 500 per board per pull), which only the full pulls at `SYNC.OLD_BOARDS_HOURS` and the staff
endpoint do. One quick pull costs the old board one changelog request per board (about a second for board.portal2.sr)
plus the demos of runs that are new to us.
- Status changes and hides are written to the audit log as the service (`run.ban`, `run.unban`, `run.verify`,
  `run.unverify`) with the reason.

Then a Steam sync run the old board still doesn't have, three days after it was set (the old board takes Steam's
times in irregular batches, sometimes more than a day apart), is one it left out on purpose: it's hidden with the admin note "Not on the old board".
If the old board adds it later, the next pull links it and shows it again.
A Steam sync run is deleted at once when the old board already had an equal or better time by the same player on the map
before Steam showed it: the old board only takes improvements, so it will never list it. That's one run timed twice: Steam
has the game's time and a demo submission SAR's, a few hundredths apart (15.01 and 14.98), so the two never matched and the
Steam copy sat pending as a duplicate until the three-day rule. It's deleted, not hidden, because a hidden run shows as
banned in the player's run history and this one did nothing wrong. The delete is in the audit log as the service
(`run.delete`, with a copy of the row). A co-op copy goes only when its partner's half is a copy too. The Steam sync doesn't
add it back, since it only takes times better than the player's best here. The copies the first version of this rule hid
(banned, with the note "The old board already has an equal or better time…") are deleted on the next pull too.

`POST /admin/old_boards_sync` (admins / service token; also the Jobs tab on the Admin page) pulls now; `?dry_run=true` only reports what would change and
`?game=1` / `?game=2` limits it to one board. Times on the site are shown in each viewer's own time zone, with the full
date and time on hover (as the old boards showed them).

## 14. Security and performance hardening

From a review of the server and site (October 2026):

- **`/admin/changelog`, `/admin/banned_stats`** now need a staff account or the service token (they were open, and
  the first lists banned and pending runs with their notes). **`/admins`** only takes `admin_level` from staff; everyone
  else gets the public list (shadow admins stay unlisted).
- The **raw insert/update endpoints** the backend service uses (`POST /sp/post_score`, `PUT /sp/update`,
  `POST /coop/post_score`, `PUT /coop/update_changelog/...`, `POST /points/*`, `POST /user`, `PUT /user/avatar/...`,
  `POST /changelog`, `PUT /changelog/demo`) take the **service token only** (`ServiceOnly` in `tools/auth.rs`). They
  bypass the validated, audit-logged moderation paths, so staff accounts no longer reach them; the site doesn't use them.
- The **changelog filter** (`controllers/changelog.rs`, `build_filtered_changelog`) is built with `sqlx::QueryBuilder`:
  request values are bound parameters rather than text pasted into the SQL.
- **Database pools** (`main.rs`): the API's pool has 20 connections, a 5 s wait for one and a **60 s statement
  timeout**, so a slow query can't tie up every connection and stall the whole API. The background jobs (syncs, demo
  parsing, cache rebuilds, the "run now" endpoints) use their **own pool** (`tools::jobs::JobsPool`) without a timeout,
  so a long pass neither starves the API nor gets cut short.
- **World record history**: migration `20261109000000_wr_index.sql` adds a partial index on `changelog`
  (`post_rank = 1 AND verified IS TRUE AND banned = false AND wr_hidden = false`, newest first). The WR query on a map
  page went from a scan of the whole changelog to an index read (~35 ms to ~10 ms idle; far more under load).
- **Co-op map boards** (`controllers/coop.rs`): the map's runs are found through `changelog (map_id, score)` and joined
  to their bundle, instead of filtering `coop_bundled` by a sub-select that scanned every bundle, and the two
  `sar_version` sub-selects per row are joins. Same rows and order (checked on five maps).
- **One HTTP client** (`tools::helpers::http_client`) for the Steam calls, instead of one per sign-in.
- The **CORS** allowed origins come from `SERVER.PUBLIC_URL` (plus the dev frontend); the access log leaves out the
  Steam callback (its query string holds the sign-in's one-time values).
- **Site headers** (`frontend-legacy/security-headers.conf`, copied to `frontend/`, included by `nginx.conf`): a Content-Security-Policy (no inline
  scripts: the theme script moved to `public/theme.js` and the image builds with `INLINE_RUNTIME_CHUNK=false`),
  `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and HSTS when the request
  came in over https.
- **Postgres** in `docker-compose.yaml` runs with `shared_buffers=512MB`, `work_mem=16MB`,
  `effective_cache_size=2GB` (the image's defaults spilled the bigger sorts and joins to disk).
- `GET /banned_user?profile_number=` works again (its query parameter couldn't be read before).

## 15. Stats page

`GET /stats/site?game_id=` (`controllers/site_stats.rs`) feeds the site's Stats page (`/stats`, in the top bar; Compare
players and Countries are its other tabs at `/stats/compare` and `/stats/countries`, and the old `/compare` and
`/more/countries` addresses redirect). It answers the game's totals, leader lists (world records held and set, runs,
runs this year, co-op partners, demos, portals), the longest-standing current world records, and the top
100 peak points per board with the date reached and the player's points now. Peaks: one sweep over every run in time
order picks the candidates (`points_history::all_peaks`); each listed peak is then the same per-player peak the
profile shows, and "now" comes from the points boards, so the page and profiles always agree (a peak below the points now is raised to them, as on the profile). The sweep also checks the peaks of players a run lifts (a co-op run dropping out), not only the runner's. The stats are built in
the background after the points boards (startup and after each change); an out-of-date copy is served while a new
one is built, so no request waits for it.

`GET /stats/wr?game_id=` (`controllers/wr_stats.rs`) feeds the Records, History and Race tabs. From the world
record history, each map's records are split into reigns (each faster record time until a faster one; players who tie
join from their own run). It answers every map's current record with how long it has stood and the total time per
board; per player the maps held now, days spent holding records and record runs set; the longest-lasting records
(standing ones included, with who beat them); the longest streaks one player held a map through several record times;
the biggest improvements; how many records each player held at the start of every month since 2012 (the race, per
board and overall). Cached ten minutes; cleared with the points cache.

## 12. Known gaps

- `server/src/tests/db_tests.rs` doesn't compile: it calls three `Changelog::transaction_*` functions that don't exist
  upstream either. Each feature here was instead tested end to end against a local database.
- Staff permissions beyond those listed in [§3](#3-accounts-staff-roles-and-permissions) are still to be decided.
- The migration comment in `20261020000000_map_bsp_names.sql` says Mel's Story and Advanced maps can share a file name;
  in the imported data every BSP name is unique.
