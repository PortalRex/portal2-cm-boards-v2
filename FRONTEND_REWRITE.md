# Frontend rewrite plan

Instructions for rebuilding the website on the stack in [CLAUDE.md](CLAUDE.md). Read CLAUDE.md first. Its stack,
structure, data-fetching and testing rules apply to every step here.

**Goal:** a new `frontend/` that works **exactly like the current site**: the same pages, URLs, features,
permissions and saved settings, against the same server API. Only the internals change: React + Vite, TypeScript,
the Bulletproof React structure, TanStack Query and Router, shadcn/ui, and tests for everything.

**Ground rules**

- **The server API is the contract. Don't change it.** The rewrite needs no backend changes. If something seems to need one,
  stop and ask before touching `server/`.
- **The old site defines correct behaviour.** When unsure what something should do, read the legacy code and run
  the legacy site. Don't guess, and don't "improve" behaviour along the way. List ideas under *Follow-ups* at the end of this file instead.
  The only exceptions are the [accepted differences](#accepted-differences) listed in Step 6.
- **Port behaviour, not code.** Don't copy the old CSS files, module-level listener stores, `useApi` or
  `dataVersion` patterns (see [What not to carry over](#what-not-to-carry-over)).
- Work in the order under "Order of work" below. Each step ends with its tests passing, `npm run typecheck` and
  `npm run lint` clean, and a commit.
- **Commit after every task of decent size**, without waiting to be asked. This covers a finished checklist item, a
  ported helper module with its tests, a component, or a route. Don't let work pile up across several items. The rules:
  - Commit only when the tests for the touched area pass and typecheck and lint are clean. If you have to stop
    before then, make a `wip:` commit and note it in the progress log.
  - Use Conventional Commit messages scoped to the area, for example `feat(frontend/profiles): points history chart`,
    `test(frontend): adapter fixtures for changelog` or `chore: rename old frontend`.
  - Each commit includes the matching `REWRITE_PROGRESS.md` update. The hash is filled in by the next commit (see
    below).
  - Commit on the working branch. Never commit to `main`, and don't push unless the user asks.
- **Keep [REWRITE_PROGRESS.md](REWRITE_PROGRESS.md) up to date at all times** (see below). The work will span many
  sessions, and any session can be cut off without warning.

---

## Progress tracking (read this first in every session)

The progress log is `REWRITE_PROGRESS.md` at the repo root. It's the single source of truth for what's done, so a new
session can pick up exactly where the last one stopped.

**Starting a session**

1. Read `REWRITE_PROGRESS.md` in full before doing anything else.
2. Compare it with reality: `git status`, `git log --oneline -20`, and run the test suite. If the log and the
   repository disagree, the repository wins. Fix the log first and note the correction. Fill in any `(pending)`
   hashes from `git log`.
3. Continue with the item under **Current task**. If it's empty, take the next unchecked item in the checklist.

**While working**

- Before starting an item, write it under **Current task**, with the plan and the files you expect to touch.
- Update the log **as soon as each item is done**, not at the end of the session. An item is done only when its tests
  pass and it's committed. Commit right away.
- **Commit hashes:** a commit can't contain its own hash. Tick the item and write `(pending)` in place of the hash in
  the same commit as the work. The next commit, or the start of the next session, replaces `(pending)` with the real
  hash from `git log`. Don't amend commits to add their own hash, because amending changes the hash.
- If you stop partway through an item, write what's finished, what's left and any half-done changes under **Current task**.
  Uncommitted work must either be committed as a WIP commit or described precisely enough to redo.
- Record decisions, surprises and blockers as they happen (for example "legacy does X when Y, kept it" or "endpoint returns Z,
  adapter handles it"). Note questions waiting on the user under **Blocked / questions** and move on to another item.
- Commit the log together with the work it describes, so the log and the code never go out of sync.

**Layout of `REWRITE_PROGRESS.md`.** Create it in Step 1 with this structure:

```markdown
# Frontend rewrite progress

## Current task
<!-- What is being worked on right now, plan, files touched, what's left. Empty when between items. -->

## Checklist
<!-- Every step and Step 5 feature item from FRONTEND_REWRITE.md, as checkboxes. Exaple:  -->
- [x] 1. Rename old frontend:
- [x] 2a. Vite + TS strict + alias: (pending)
- [ ] 2. Scaffold
  - [ ] Vite + TS strict + alias
  - [ ] ...

## Log
<!-- Newest first. One entry per finished item: date, what was done, commit, tests added. -->

## Decisions and findings
<!-- Legacy behaviours discovered, choices made and why. -->

## Blocked / questions
<!-- Things waiting on the user. -->
```

Break the checklist down so that each line is small enough to finish and commit in one sitting. For Step 5, use one line per
checklist bullet (for example "5.2 Map page: WR history with hidden WRs for staff").

---

## Step 1: Rename the old frontend

1. Move it with history: `git mv frontend frontend-legacy`.
2. Update every reference to `./frontend`:
   - `docker-compose.yaml`: change `web.build` from `./frontend` to `./frontend-legacy` **for now**, so
     `docker compose up` keeps serving the legacy site. Step 2 switches it back to `./frontend` once the new app builds.
   - `docker-compose.dev.yaml`: likewise, change the volume from `./frontend:/app` to `./frontend-legacy:/app` for now.
     Step 2 switches it back and replaces the CRA-specific command (`npm start`) and env (`REACT_APP_API_URL`).
   - `README.md` (Docker / "Developing the frontend" sections) and the layout table in `CLAUDE.md`: add a
     `frontend-legacy/` row ("old CRA site, reference only, do not modify") and point the `frontend/` row at the new app.
3. To run the legacy site for side-by-side comparison, run `npm start` in `frontend-legacy/` with
   `REACT_APP_API_URL=/api/v1 DEV_API_PROXY=http://localhost:8080 PORT=3001`.
4. Create `REWRITE_PROGRESS.md` (see [Progress tracking](#progress-tracking-read-this-first-in-every-session)) with
   the full checklist.
5. Commit: `chore: rename old frontend to frontend-legacy`.

**Don't edit anything inside `frontend-legacy/`.** Delete it only after parity is signed off (Step 6) and the user
approves.

---

## Step 2: Scaffold the new app

Create `frontend/` with `npm create vite@latest frontend -- --template react-ts`, then:

- **TypeScript:** `strict: true`, `noUncheckedIndexedAccess: true`, and the `@/*` → `src/*` path alias in both
  `tsconfig` and `vite.config.ts`.
- **Dependencies:** `@tanstack/react-query` (+ devtools), `@tanstack/react-router` + `@tanstack/router-plugin` (file-based routes in
  `src/app/routes/`), `zod`, Tailwind + shadcn (`npx shadcn@latest init`, CSS-variable theming with light and dark),
  `recharts` (charts, as in the legacy site).
- **Dev dependencies:** `vitest`, `@vitest/coverage-v8`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`,
  `@testing-library/jest-dom`, `msw`, `eslint` with `typescript-eslint`, `eslint-plugin-react-hooks`,
  `eslint-plugin-import` (`import/no-restricted-paths` for the shared → features → app rule, and no
  cross-feature imports), `prettier`.
- **Scripts:** `dev`, `build` (`tsc -b && vite build`), `preview`, `test`, `typecheck` (`tsc -b --noEmit`), `lint`,
  `format`.
- **Dev proxy:** this replaces `setupProxy.js`. In `vite.config.ts`, proxy `/api` to `process.env.DEV_API_PROXY ?? 'http://localhost:8080'`
  with `changeOrigin: true` and `xfwd: true` (Steam sign-in compares the forwarded host with `SERVER.PUBLIC_URL`).
  Set `server.host: true` so other devices can reach it.
- **Environment variables:** rename and validate them with zod in `src/config/env.ts`.

  | Legacy | New | Default |
  |---|---|---|
  | `REACT_APP_API_URL` | `VITE_API_URL` | `/api/v1` |
  | `REACT_APP_AUTORENDER_URL` | `VITE_AUTORENDER_URL` | `https://autorender.portal2.sr` |
  | `REACT_APP_AUTORENDER_STORAGE_URL` | `VITE_AUTORENDER_STORAGE_URL` | `https://portal2.fsn1.your-objectstorage.com` |
  | `REACT_APP_MEL_GAME_ID` | `VITE_MEL_GAME_ID` | `2` |
  | `REACT_APP_USE_MOCK` | `VITE_USE_MOCK` | `false` |

- **Docker:**
  - `frontend/Dockerfile`: same two stages, but `ENV VITE_API_URL=/api/v1` and copy `dist/`, not `build/`.
  - `frontend/nginx.conf`: copy it from legacy unchanged (the 60 MB upload limit, the `/api/` proxy headers and the 120 s
    read timeout for the staff-inbox long poll), except change the immutable-cache block from `/static/` to `/assets/`.
  - `docker-compose.dev.yaml`: run `npm run dev -- --port 3000`, set `DEV_API_PROXY: http://server:8080`, and mount
    `./frontend`.
  - Switch `docker-compose.yaml` back to `./frontend`.
- **Public assets:** copy everything in `frontend-legacy/public/` except `index.html` to `frontend/public/`
  (`favicon.ico`, `logo192.png`, `logo512.png`, `manifest.json`, `robots.txt`, `unknown-partner.svg`, `roles/`).
  - Copy the images in `frontend-legacy/src/scenes/global/img/` (backgrounds, logos, chamber images, Mel images, flags,
    `pfp.png`) to `src/assets/`. Keep the Mel `NOTICE.md`.
- **Testing setup:** `vitest.config` with jsdom, `src/testing/setup.ts` (jest-dom, MSW `server.listen/resetHandlers/close`),
  and `src/testing/test-utils.tsx` with a `renderWithProviders(ui, { route, user })` that builds a fresh QueryClient
  (`retry: false`) and an in-memory router.
- Add a smoke test (the app renders the shell). Commit: `feat(frontend): scaffold Vite + TS + TanStack + shadcn`.

---

## Step 3: Foundation (shared code)

Build these before any page. Each needs its own tests.

### Where code that several features need lives

The lint rule allows only `shared → features → app` imports and no cross-feature imports. Several things are needed
across features, so their homes are decided here. Configure the ESLint zones to match before building the first feature (Score Updates).

| Need | Lives in | Why |
|---|---|---|
| Catalog query, types and selectors (games, chapters, maps, board paths) | `src/lib/catalog/` (shared, **not** a feature) | `hooks/use-game.ts`, the top bar and almost every feature need it. It's site infrastructure, not a page. |
| Query keys for every resource | `src/lib/query-keys.ts`, a single key factory (`queryKeys.changelog(...)`, `queryKeys.mapBoard(...)`, `queryKeys.profile(...)`, `queryKeys.run(...)`, `queryKeys.catalog()`) | Features build their keys from it, so a mutation in one feature can invalidate another feature's queries without importing that feature. |
| Invalidation after run and user changes | `src/lib/invalidate.ts`: `invalidateRun(qc, { changelogId, mapId, profileNumbers, game })` and `invalidateUser(qc, profileNumber)` | One place knows which boards, changelog lists and profiles a run affects. Every staff action, reaction, submission and report calls these. |
| Shared run model: raw changelog/ranked row types and their adapters | `src/types/runs.ts` and `src/lib/adapters/` | Score Updates, map boards, profiles and stats all show the same run rows. |
| Current user, roles, view-as-player | `src/lib/auth/` (query + helpers) and `hooks/use-current-user.ts` | Needed by the shell, the route guards and every staff control. Only the sign-in UI and Settings forms stay in `features/auth`. |
| Selected game | `hooks/use-game.ts` (imports `lib/catalog`) | Shared hook, so features can use it. |
| Run Details panel | `features/runs`, **composed in through a slot** | See below. |
| Staff controls on profiles | `features/admin`, composed in through a slot | Same pattern as Run Details. |

**Run Details composition.** In the legacy site, Run Details expands inline under a row (`toggleOnRowClick`) on Score
Updates, the Map page and the profile tabs. It isn't a page-level modal.

- The list components in `score-updates`, `leaderboards` and `profiles` take a render prop,
  `renderRunDetails?: (run: Run) => ReactNode`, and call it for the expanded row.
- The route file (app layer, which may import any feature) passes `(run) => <RunDetails run={run} />` from
  `features/runs`.
- Profiles get their staff tools the same way, through a `staffTools` slot that the route fills from `features/admin`.
- The features themselves never import each other. Tests for a list feature pass a stub render prop. `features/runs` has its own tests.

If another cross-feature need comes up, use the same choice: shared data and logic go in `lib/`, `hooks/` or `types/`, and
shared UI is composed in through a slot at the route. Record the decision in the progress log. Never add a lint exception.

### API client and errors: `src/lib/api-client.ts`

- `api.get/post/put/delete<T>(path, { params, body, signal })`. Params that are `null`, `undefined` or `''` are left out,
  as in legacy `getJson`. Requests use `credentials: 'include'`, JSON bodies by default and `FormData` for demo
  uploads. A non-2xx response throws `ApiError { status, message }`, with the message taken from the server's
  `{ error }` body.
- `apiUrl(path)`: plain URLs for links and `<img>` sources, such as demo downloads (`/demos/{id}/file`, `/runs/{id}/demo`),
  map images (`/maps/{steamId}/image?v=`), game images (`/games/{id}/images/{kind}?v=`) and Steam login
  (`/auth/steam/login`).
- `game_id` param: Portal 2 sends **no** `game_id`. Every other game sends its `games.id` from the catalog.

### Sample data mode

The legacy site falls back to deterministic sample data (`src/api/mock.js`) when the server can't be reached, and
shows which sources are offline.

- Rebuild this with **MSW**. The handlers in `src/testing/mocks/` serve both the tests and a browser worker that
  starts when `VITE_USE_MOCK=true`.
- Port the generators from `mock.js` into `src/testing/data/` factories.
- Port the "using sample data" indicator too, so it's clear when sample data is showing.
- **Decided: sample data only appears when `VITE_USE_MOCK=true`.** Drop the legacy automatic fallback. If the server is
  down, the new site shows a normal error state, not sample data. This way the live site never shows fake scores. Keep the
  mock worker out of production builds with a dynamic import behind the env check.

### Catalog bootstrap: `lib/catalog`

- Legacy blocks the first render on `loadCatalog()` (`GET /catalog`) and then merges it into the static map data in
  `data/maps.js` (`applyCatalog`).
- New version:
  - The root route's loader calls `queryClient.ensureQueryData(catalogQueryOptions())`.
  - `lib/catalog` exposes pure, tested selectors in place of the old mutable `GAMES` object: games,
    seasons, chapters per mode, maps per game/mode, `findMap`, `mapPath`, mode labels, `gameKey`/slug, board paths.
  - Keep the built-in Portal 2 / Mel data from `data/maps.js`, `data/bspNames.js` and `data/seasons.js`, so the site
    still works while the catalog is loading or unreachable.
- Map ids are Steam leaderboard ids for Portal 2 and board ids (1 to 44) for Mel. Always strings.

### Current user, roles and private mode: `lib/auth` (sign-in UI in `features/auth`)

- `GET /auth/me` gives the current user, or none. Logout is `POST /auth/logout`. Login is a link to
  `apiUrl('/auth/steam/login')` with a `return` path that sends the user back to the page they were on.
- Role helpers: port `isStaff`, `isRoleAdmin` and `ROLE_LABELS` from `hooks/useCurrentUser.js`. Sample users and
  banned users are never staff.
- **View as player:** `localStorage['p2cm.viewAsPlayer'] = '1'` hides all staff UI. It is toggled in Settings.
- **Private mode:** `GET /site` → `{ private }`. When it's true and the user isn't staff, show the "Coming soon"
  sign-in gate (port `PrivateGate.jsx`, including the "signed in as a non-staff account" state with sign-out). Do this in
  the root route.

### Selected game: `hooks/use-game.ts`

Port `hooks/useGame.js` exactly. This is site-wide state:

- The choice is saved in `localStorage['p2cm.game']`.
- **The URL wins over the saved choice**:
  - `?game=` (a season maps to its base game)
  - `/leaderboard/mel*` → Mel
  - `/leaderboard/game/{slug}` → that game
  - other `/leaderboard/*` → Portal 2
  - `/map/{mode}/…` → the game that owns the mode
- The banner in the top left picks it, and only games of kind `game` that aren't hidden can be picked.
- Branding (logo, short name, background) comes from the catalog, falling back to the built-in images.
- The game goes into every query key that depends on it.

### Per-browser settings: keep the same localStorage keys

Users keep their settings after the switch, so keep these keys and value formats exactly:

| Key | Holds |
|---|---|
| `p2cm.game` | selected game id |
| `p2cm.theme` | theme |
| `p2cm.viewAsPlayer` | `'1'` when on |
| `p2cm.coopPbStyle` | co-op PB display style (`COOP_PB_STYLES`) |
| `p2cm.collapsed` | collapsed panels/groups (`useCollapsed`, `useCollapsedGroup`) |
| `p2cm.follows` | followed players |

Wrap every access in try/catch, as legacy does.

### Pure helpers: port with tests first

Port these to TypeScript in `src/lib/` (or a feature's `utils/`), **writing the tests from the legacy outputs first**:

- `lib/format.js`: `formatScore` (`2243 → "22.43"`, `11783 → "1:57.83"`), `formatDelta`, `formatLongScore`,
  `timeAgo`, `formatDate(Time)`, `parseTimestamp`, `ordinalSuffix`, `formatPoints`
- `lib/ranks.js`: rank colours and tile variables, including the WR colour/shine/glow from the latest commit
- `lib/runFilters.js`: limits, toggles, rank/time/banned options
- `lib/coopRoles.js`: host and partner colours (blue/orange/neutral) and role overrides after `PUT /coop/{id}/host`
- `lib/activity.js`: heatmap windows
- `lib/adminActions.js`: action labels and tones for the audit log
- `lib/youtube.js`, `lib/scroll.js`
- the `pointsForRank` formula from `api/mock.js`, used to compute `pointsDelta`
- `data/countries.js`, `data/roles.js`

### Response adapters

Legacy `api/client.js` turns raw rows into UI objects: `adaptChangelog`, `adaptSpRanked`, `adaptCoopRanked`, etc.

- Write the raw response types (snake_case, as the Rust models send them) in each feature's `types/`.
- Port each adapter as a pure function with unit tests, using fixtures captured from the real API.
- Keep the edge cases:
  - The filler partner `"N/A"` becomes "Unknown partner".
  - Co-op players come blue (host) first.
  - Older rows that lack co-op profile numbers are filled in.
  - `verified !== false` counts as verified.
  - `pointsDelta` is null for pending or banned runs.
  - `date_estimated` rows are marked as estimated.

### Layout and shell: `components/layouts`

Port `Layout.jsx` and `TopBar.jsx`:

- **Top-level navigation:** Score Updates `/`, Leaderboard `/maps`, Aggregate `/leaderboard/overall`, Stats
  `/stats`, More.
- **Dropdown behaviour:** the active-page tag (blue) in the dropdowns, and the Aggregate dropdown, which changes with
  the game. For Portal 2 it shows Overall, Single Player and Cooperative with chapter lists. For Mel it shows Overall,
  Story and Advanced. Custom games list their modes. It also shows the current season and the season lists.
- **More menu:** Discord, GitHub, Donators, Wall Of Shame, About.
- **Account area:** the Settings link, the Admin link (staff only), the Submit Run button and the staff inbox (see
  Admin).
- **Global behaviour:** the theme toggle (`p2cm.theme`) and scroll-to-top on route change. Use the router's
  `scrollRestoration`.

Rebuild the shared UI from `components/ui.jsx` and `Icons.jsx` (panels, tabs, selects, toggles, avatars, flags, score
cells) on shadcn primitives in `components/ui/` plus small shared components. Commit after each part.

---

## Step 4: Routes (keep every URL)

Every legacy URL must keep working, including redirects that keep the query string.

| Legacy path | Renders | Feature |
|---|---|---|
| `/` | Score Updates | `score-updates` |
| `/maps` | Map list | `leaderboards` |
| `/map/$mode/$levelId` | Map page | `leaderboards` |
| `/leaderboard` | → `/leaderboard/overall` | |
| `/leaderboard/$kind` | Aggregated (Portal 2: overall / sp / coop) | `aggregated` |
| `/leaderboard/mel` | → `/leaderboard/mel/overall` | |
| `/leaderboard/mel/$kind` | Aggregated, Mel (overall / story / advanced) | `aggregated` |
| `/leaderboard/chapter/$chapterId` | Aggregated by chapter | `aggregated` |
| `/leaderboard/game/$gameId` and `/$board` | Aggregated for a custom game / season | `aggregated` |
| `/profile/$profileId` | Profile | `profiles` |
| `/stats` | Stats: Runners tab | `stats` |
| `/stats/records`, `/history`, `/race`, `/compare`, `/countries` | Stats tabs | `stats`, `compare`, `countries` |
| `/stats/times` | → `/stats` | |
| `/compare` | → `/stats/compare` (keep `?a=&b=`) | |
| `/more/countries` | → `/stats/countries` (keep query) | |
| `/more/settings` | Settings | `auth` / settings |
| `/more/wall-of-shame` | Wall of Shame | `leaderboards` |
| `/more/donators` | Donators | `donators` |
| `/more/about` | About | static |
| `/more/$page`, anything else | Placeholder / not found | |
| `/admin` | Staff panel (guarded) | `admin` |

Routes stay thin. A route validates its params and search with zod, prefetches in its `loader`, and renders a feature component.
Filters, tabs, pagination, `?game=` and `?season=` live in validated search params, so links can be shared, as in legacy.

---

## Step 5: Features

Build one feature at a time, in this order. For each one:

1. Read the legacy page and its components fully. `frontend-legacy/src/api/client.js` lists every endpoint call, and the
   handler doc comments in `server/src/api/v1/handlers/` document the responses.
2. Write down every behaviour as a test (rendering, filters, URL state, role visibility, mutations).
3. Build it, then commit.

The notes below cover only what the legacy code doesn't make obvious.

| # | Feature | Legacy source | Notes |
|---|---|---|---|
| 5.1 | Score Updates `/` | `pages/ScoreUpdates/`, `RunHistory.jsx` | Filters, limits and toggles live in search params. Includes the daily chambers, weekly recap and graph. Rows expand inline into Run Details through the slot. |
| 5.2 | Map list, Map page, Wall of Shame | `pages/MapList/`, `pages/MapPage/`, `pages/WallOfShame/`, `scenes/global/` | WR history; staff also see hidden WRs. Catalog image overrides fall back to the built-in images. Co-op halves and the co-op PB style setting. |
| 5.3 | Runs: details, media, reactions, reports, Submit Run | `RunDetails.jsx`, `RunMedia.jsx`, `SubmitRun.jsx`, `api/autorender.js` | See below. |
| 5.4 | Aggregated boards | `pages/Aggregated/` | Boards for Portal 2, Mel, chapters, custom games and seasons. Custom-game boards are addressed as `{slug}-{game_mode}` (BACKEND_CHANGES.md). |
| 5.5 | Profiles | `pages/Profile/`, `useFollows.js`, `useWheelZoom.js` | Tabs differ per game; seasons are picked inside a tab. Points history chart with wheel zoom, activity heatmap, follows. Staff tools come in through the `staffTools` slot. |
| 5.6 | Stats, Compare, Countries | `pages/Stats/`, `pages/Compare/`, `pages/Countries/` | Compare uses `?a=&b=` and a debounced player search. |
| 5.7 | Settings | `pages/Settings/` | Respect `name_locked` and `avatar_locked`. The view-as-player toggle is for staff only. |
| 5.8 | About, Donators, Placeholder | `pages/About/`, `pages/Donators/`, `pages/Placeholder.jsx` | Static. |
| 5.9 | Admin and staff inbox | `pages/Admin/`, `StaffInbox.jsx` | See below. |

**5.3 details**

- Every staff action (ban, verify, delete, remove demo, hide from WR history, set co-op partner or host, notes) needs a
  reason, is hidden in view-as-player mode, and calls `invalidateRun` on success.
- Autorender calls (`check-videos-exist`, `HEAD …/video?source=`) go directly to `VITE_AUTORENDER_URL`, and video files
  come from `VITE_AUTORENDER_STORAGE_URL`.
- Demo upload is multipart, up to 50 MB: preview first, then submit. Show the server's error messages as legacy does.
  Admins can also enter the run by hand.

**5.9 details**

- The route guard allows staff only, respects view-as-player, and some parts are admin-only. Copy legacy's role checks exactly.
- The games editor (about 1,100 lines in legacy) must be split into components. Every change to it invalidates the catalog query.
- The staff inbox long-polls `GET /admin/inbox/wait` (25 s). Build it as a hook that aborts on unmount, restarts after
  each response and writes into the inbox query cache with `setQueryData`.

---

## Step 6: Verify parity and cut over

1. **Run both sites against the same server and database:** legacy on :3001, new on :3000. For every route in Step 4,
   check each item of its Step 5 checklist as:
   - an anonymous visitor
   - a signed-in player
   - a verifier, a moderator and an admin
   - an admin with view-as-player on
   - Portal 2, Mel and a season, in light and dark theme
   - phone width
2. **Record the result:** keep a checklist (`frontend/PARITY.md`) with one line per route and feature: ✅ matches,
   ☑️ an [accepted difference](#accepted-differences) (name it), or ❌ plus a description of the difference. Every ❌ is
   fixed or explicitly accepted by the user, and then added to the list below.
3. **Settings carry over:** with legacy settings already in localStorage (game, theme, follows, collapsed, co-op PB
   style, view-as-player), the new site opens with the same state.
4. **Final checks:**
   - Old links and redirects resolve (`/compare?a=..&b=..`, `/more/countries`, `/stats/times`, `/leaderboard`,
     `/leaderboard/mel`).
   - The Docker build and dev compose both work.
   - Steam sign-in works through the proxy (it needs the forwarded host).
   - Demo uploads up to 50 MB go through nginx.
5. **Cut over and clean up:**
   - Once the user approves, delete `frontend-legacy/`.
   - Remove its rows from `README.md` and `CLAUDE.md`.
   - Update the README's "Developing the frontend" section for Vite.

---

### Accepted differences

Deliberate changes from the legacy site that the user has already approved. Don't "fix" them, and mark them ☑️ in
`PARITY.md`, not ❌.

| # | Legacy | New | Why |
|---|---|---|---|
| D1 | Falls back to sample data (`api/mock.js`) automatically when the API can't be reached, even in production | Sample data only when `VITE_USE_MOCK=true`. If the API is down, pages show a normal error state | The live site must never show fake scores |

Not differences, so keep them as legacy does: the catalog still falls back to the built-in Portal 2 / Mel data when
`GET /catalog` fails (that's real map data), and the "using sample data" indicator still appears whenever sample data shows.

---

## Order of work

Build in this order. The detailed checklist lives in `REWRITE_PROGRESS.md`.

1. Rename (Step 1), then scaffold (Step 2).
2. Foundation (Step 3).
3. Features, in the order of Step 5: Score Updates and read-only Run Details, then maps and Wall of Shame,
   Aggregated, Profiles, Stats, then the write paths (Submit Run, reactions, reports, Settings), then Admin.
4. Parity sign-off and cutover (Step 6).

Each step ends with tests, typecheck and lint passing, and a commit.

## Tests required for each feature

On top of the rules in CLAUDE.md, every feature needs:

- **Adapters and utils:** unit tests using fixtures captured from the real API (save them in `src/testing/fixtures/`).
- **Query hooks:** a success test, an empty-response test and an error test, plus a check that the request carries
  `game_id`, filters and paging.
- **Routes:** a render test for each URL in Step 4, including each redirect, with and without search params.
- **Role visibility:** a test for each staff control showing that an anonymous user, a player and a staff member in
  view-as-player mode **don't** see it, and that the right role does.
- **Mutations:** a test that the request body (including `reason`) is correct and that the right queries are
  invalidated.

## What not to carry over

- Per-component `.css` files. Use Tailwind and shadcn tokens instead.
- `useApi` and `dataVersion` / `bumpDataVersion`. Use TanStack Query and invalidation instead.
- Module-level `listeners` stores (`useGame`, `useCurrentUser`, `coopRoles`, the offline sources). Use the query cache,
  router search params or a small context.
- The mutable `GAMES` / `mapsByKey` objects patched by `applyCatalog`. Use pure selectors over the catalog query.
- Direct `fetch` calls in components and pages.
- MUI and Emotion, which the legacy `package.json` lists. Don't add them back.

## Follow-ups

Ideas found during the rewrite that would change behaviour. List them here and don't build them yet.

- Aggregated boards: picking a country drops `?season=` (legacy replaces the whole query), so a season board flips
  to all-time. Keeping the season would match what the tabs and chapter picker already do.
