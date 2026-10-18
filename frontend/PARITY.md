# Parity with the legacy site (Step 6)

How it was checked (2026-10-18): both sites ran against the same server and database, legacy (CRA) on :3001 and the
new site (Vite) on :3002. The server was a second, read-only instance of the local board on :8082: same Postgres,
private mode off, every background job off, no demo parser. On each page both tabs measured every visible text
element, image, icon and control: position, size, font size, weight, family, line height, letter spacing, text
transform, colour, background, decoration and list style. A script lined the two pages up by their text and listed
every difference over 2 px (several pages were also checked at 0 px).

Legend: ✅ matches · ☑️ accepted difference (named) · ❌ differs · ⏳ not checked in the browser yet (see notes)

## Routes

Columns: desktop at 1400 px in the dark theme, phone at 375 px (touch emulation), light theme at 1400 px, and the
in-between breakpoints (900, 1320 and 700 px). "Mel" is the site with Mel selected as the game.

| Route | Desktop | Phone | Light | Breakpoints | Notes |
|---|---|---|---|---|---|
| `/` Score Updates | ✅ | ✅ | ✅ | ✅ 900 / 1320 / 700 | Also with a run's details open, the World records filter, page 2 and More filters. Mel ✅ |
| `/maps` | ✅ | ✅ | ✅ | ✅ 700 | Also the co-op mode (`?mode=coop`). Mel ✅ |
| `/map/sp/47458` | ✅ | ✅ | ✅ | ✅ 900 / 1320 / 700 | Also an open board row and Chamber History (see the server note) |
| `/map/coop/47741` | ✅ | ✅ | ✅ | | |
| `/map/story/1` (Mel) | ✅ | ✅ | | | |
| `/leaderboard` → `/leaderboard/overall` | ✅ | ✅ | ✅ | ✅ 900 | Same redirect |
| `/leaderboard/mel` → `/leaderboard/mel/overall` | ✅ | ✅ | ✅ | | Same redirect |
| `/leaderboard/chapter/7` | ✅ | ✅ | | | |
| `/leaderboard/game/bexc-is-bald` (custom game) | ✅ | | | | Same redirect to `/overall` |
| `/leaderboard/game/portal-2-season-1` (season) | ✅ | ✅ | | | Same redirect to `/leaderboard/overall?season=…` |
| `/profile/{id}` | ✅ | ✅ | ✅ | ✅ 900 / 1320 / 700 | Every tab (Singleplayer, Cooperative, Stats, Legacy, Info). Mel ✅ |
| `/stats` | ✅ | ✅ | ✅ | ✅ 1320 | Mel ✅ |
| `/stats/records` | ✅ | ✅ | ✅ | | Mel ✅ |
| `/stats/history` | ✅ | ✅ | ✅ | ✅ 900 / 700 | |
| `/stats/race` | ✅ | ✅ | ✅ | | |
| `/stats/compare?a=&b=` | ✅ | ✅ | ✅ | | `/compare?a=&b=` keeps the query, as legacy |
| `/stats/countries` | ✅ | ✅ | | | `/more/countries?board=sp` keeps the query, as legacy. Tied rows: see the server note |
| `/stats/times` → `/stats` | ✅ | | | | Both drop the query |
| `/more/settings` | ✅ | ✅ | ✅ | | Signed out (see roles) |
| `/more/wall-of-shame` | ✅ | ✅ | ✅ | | |
| `/more/donators` | ✅ | ✅ | ✅ | | |
| `/more/about` | ✅ | ✅ | ✅ | | |
| `/more/discord`, unknown addresses | ✅ | | | | Placeholder and "There's nothing here." |
| `/admin` | ✅ | | | | Visitors and players: "Staff only." |

## Roles

| Who | Result |
|---|---|
| Anonymous visitor | ✅ every route above |
| Signed-in player | ⏳ needs a Steam sign-in, which only you can do. Covered by tests (reactions, reports, Submit Run, Settings, follows, Add demo) |
| Verifier, moderator, admin | ⏳ needs staff sign-ins. Covered by tests: every staff control's visibility per role, request bodies with the reason, invalidation; the staff panel's guard, log, reports, jobs, games editor and inbox |
| Admin with view-as-player on | ⏳ in the browser; tests check that every staff control and the inbox are hidden, and that Settings keeps the real role |

The staff and signed-in views couldn't be compared on sample data either: legacy never treats its sample user as
signed in for these. Their styling was ported from legacy's CSS, working through its cascade (recorded in
REWRITE_PROGRESS.md under Decisions).

## Accepted differences

- ☑️ D1: sample data only with `VITE_USE_MOCK=true`; the live site shows its error state when the API is down.
- ☑️ D2: Lucide icons instead of MUI's. Sizes, colours and positions match legacy's (checked above).

## Not differences (server behaviour, the same for both sites)

- Rows that tie (same points, or the same timestamp) come back from the server in a different order on each
  request: countries with 0 points (and their top players), and Chamber History entries with the same time. Two
  loads of the same site differ the same way. A follow-up for the server: add a tie-breaker to those `ORDER BY`s.
- Rolling counts ("this year" = the past 365 days) and "… ago" times change between loads.

## Fixed during this check

- Breakpoints: Tailwind's `max-[900px]:` is `width < 900px`, but legacy's `max-width: 900px` includes 900. They are
  now inclusive variants (`upto900:`), declared widest first so the narrower one wins.
- Switches whose default option has an empty value (Score Updates' "All") showed nothing chosen.
- Tailwind's reset vs legacy (no reset): `<small>` size, code font, list bullets, image max-width, a few buttons
  and paragraphs that relied on the browser's padding or margins, a range slider.
- `<Page narrow>` wasn't narrow above 1288 px.
- Smaller fixes on the map page, profile, aggregated boards, stats, countries, About and Settings (details in
  REWRITE_PROGRESS.md).

## Final checks (6.3)

| Check | Result |
|---|---|
| Old links and redirects (`/compare?a=&b=`, `/more/countries`, `/stats/times`, `/leaderboard`, `/leaderboard/mel`) | ✅ same as legacy |
| Docker production image (`frontend/Dockerfile`) | ✅ builds, serves the site, proxies `/api` |
| Compose files (`docker-compose.yaml`, with `docker-compose.dev.yaml`) | ✅ valid; the dev server listens on all interfaces |
| Steam sign-in through nginx | ✅ the sign-in redirect returns to the address the browser used (`openid.return_to` / `realm`). The sign-in itself needs your Steam account |
| 50 MB demo uploads through nginx | ✅ 50 MB reaches the server, 70 MB is refused with 413 (`client_max_body_size 60m`) |
| Settings from legacy localStorage (6.2) | ✅ the same six keys and formats; a test opens the site with legacy values set |
