# Frontend rewrite progress

## Current task
<!-- What is being worked on right now, plan, files touched, what's left. Empty when between items. -->

## Checklist
<!-- Every step and Step 5 feature item from FRONTEND_REWRITE.md, as checkboxes. -->
- [x] 1. Rename old frontend to `frontend-legacy` (compose, README, CLAUDE.md, this log): 269197e
- [x] 2. Scaffold
  - [x] 2a. Vite + React + TS strict (`noUncheckedIndexedAccess`) + `@/` alias: 535adf2
  - [x] 2b. Tailwind + shadcn init (CSS-variable theming, light/dark): 535adf2
  - [x] 2c. TanStack Query + Router (file routes in `src/app/routes/`), zod, recharts: 535adf2
  - [x] 2d. ESLint (typescript-eslint, react-hooks, import/no-restricted-paths zones) + Prettier: 535adf2
  - [x] 2e. Vitest + RTL + MSW setup, `renderWithProviders`, smoke test: 535adf2
  - [x] 2f. Dev proxy, validated env (`src/config/env.ts`): 535adf2
  - [x] 2g. Public assets and images (`public/`, `src/assets/`, Mel NOTICE.md, `theme.js`): 535adf2
  - [x] 2h. Docker: Dockerfile, nginx.conf (`/assets/`), security headers, compose back to `./frontend`: d192cc9
- [x] 3. Foundation
  - [x] 3.1 `lib/api-client.ts` (`api.*`, `ApiError`, `apiUrl`, param dropping, FormData): 7419168
  - [x] 3.2 Pure helpers: `format`: 2384e56
  - [x] 3.3 Pure helpers: `ranks`, `runFilters`, `coopRoles`: 2384e56
  - [x] 3.4 Pure helpers: `activity`, `adminActions`, `youtube`, `scroll`, `pointsForRank`: 6870ddb
  - [x] 3.5 Static data: `countries`, `roles`, built-in maps / bsp names / seasons: 7694f3b
  - [x] 3.6 Per-browser settings (localStorage keys, try/catch) and theme: f9c0072
  - [x] 3.7 `lib/catalog` (query options, selectors, built-in fallback, root loader): 74c99f5
  - [x] 3.8 `lib/query-keys.ts` and `lib/invalidate.ts`: cfb9afe
  - [x] 3.9 `lib/auth` (`/auth/me`, roles, view-as-player) + `hooks/use-current-user`: 2e3b835
  - [x] 3.10 `hooks/use-game` (URL wins, saved choice, branding): cf15221
  - [x] 3.11 Shared run model: `types/runs.ts` + adapters with captured fixtures: 5fff31a
  - [x] 3.12 Sample data mode: MSW handlers + factories, browser worker behind `VITE_USE_MOCK`, indicator: d2bead4
  - [x] 3.13 Shared UI on shadcn (panels, tabs, selects, toggles, avatars, flags, score cells, icons): c058b8c
  - [x] 3.14 Layout + TopBar (nav, dropdowns, Aggregate menu per game, More menu, account area, theme toggle): 128c893
  - [x] 3.15 Private mode gate in the root route: 846cc64
- [x] 4. Routes: every legacy URL and redirect, thin route files with zod search params: 4570ca2
- [ ] 5. Features
  - [x] 5.1a Score Updates: list, filters/limits/toggles in search params: 145f2ac
  - [x] 5.1b Score Updates: daily chambers, weekly recap, graph: ca41dc2
  - [x] 5.1c Score Updates: inline Run Details slot (read-only Run Details): 253c3e9
  - [x] 5.2a Map list (catalog images with built-in fallback): a0c0342
  - [x] 5.2b Map page: board, co-op halves, co-op PB style: c9a1553
  - [x] 5.2c Map page: WR history with hidden WRs for staff: c9a1553
  - [x] 5.2d Wall of Shame: d2f476b
  - [x] 5.4a Aggregated: Portal 2 overall / sp / coop: cd183b1
  - [x] 5.4b Aggregated: Mel, chapters, custom games and seasons: 25910a6
  - [x] 5.5a Profiles: header, tabs per game, seasons in tab: c1962ac
  - [x] 5.5b Profiles: points history chart with wheel zoom: 3a825eb
  - [x] 5.5c Profiles: activity heatmap, demo stats, co-op partners: 050a21b
  - [x] 5.5d Profiles: follows; staff tools slot: 4f233b0
  - [x] 5.6a Stats: Runners tab: (pending)
  - [ ] 5.6b Stats: Records, History, Race tabs
  - [ ] 5.6c Compare (`?a=&b=`, debounced player search)
  - [ ] 5.6d Countries
  - [ ] 5.3a Run Details: media (autorender, YouTube)
  - [ ] 5.3b Run Details: reactions, reports
  - [ ] 5.3c Run Details: staff actions with reasons + invalidation
  - [ ] 5.3d Submit Run (upload preview, submit, admin manual entry)
  - [ ] 5.7 Settings (name/avatar locks, view-as-player for staff)
  - [ ] 5.8 About, Donators, Placeholder
  - [ ] 5.9a Admin: guard, layout, audit log
  - [ ] 5.9b Admin: reports, background jobs
  - [ ] 5.9c Admin: games editor (split into components)
  - [ ] 5.9d Staff inbox long poll
- [ ] 6. Parity and cutover
  - [ ] 6.1 `frontend/PARITY.md`, every route x role x game x theme x phone
  - [ ] 6.2 Settings carry over from legacy localStorage
  - [ ] 6.3 Final checks (old links, Docker builds, Steam sign-in via proxy, 50 MB uploads)
  - [ ] 6.4 Cutover (user approval, delete `frontend-legacy/`, docs)

## Log
<!-- Newest first. One entry per finished item: date, what was done, commit, tests added. -->
- 2026-10-18: 5.6a Stats Runners (`features/stats`): `api/stats.ts` (/stats/site and /stats/wr with their adapters,
  ports of fetchSiteStats / fetchWrStats), `RunnersPanel` (totals, peak points per board in `?board=`, leader cards
  with record-days from the WR stats, longest-standing records), `stats-ui.tsx` (figures, section titles, striped
  tables, teams, map names, the 40 px switches). Shared `components/stats-shell.tsx` (the Stats tabs above the
  panel), used by the Stats, Compare and Countries routes. Legacy had no sample data for the stats endpoints; sample
  mode shows "Couldn’t load the stats." as legacy did. Fixtures `stats-site.json` / `stats-wr.json` captured and
  trimmed. Commit (pending). Tests: 7 (+2 route rows).
- 2026-10-18: 5.5d Profiles: `FollowButton` (p2cm.follows, filled star when following) in the header, and the staff
  tools through the header's slot: `features/admin` `ProfileStaffTools` (shield button with the staff-set dot, dialog
  with the shared reason: name / picture / country for moderators and admins, staff tier for admins, freeze, ban
  with a confirm click, unban, unfreeze), `utils/staff-powers.ts` (legacy staffPowers) and `api/users.ts`; the route
  passes `staffTools={(player) => <ProfileStaffTools player={player} />}`. Every change calls `invalidateUser`.
  The admin feature takes its own structural `StaffProfile` type, so it doesn't import the profiles feature.
  Shared `components/round-button.ts` for the header's round buttons. `renderWithProviders`/`renderRoute` now also
  answer /auth/me for the test user (an invalidated "me" used to refetch as signed out). Commit 4f233b0.
  Tests: 21 (+1 follow).
- 2026-10-18: 5.5c Profiles: `utils/heatmap.ts` (runs per UTC day, Sunday-first weeks with month labels, the
  all-time grid of multi-day squares, years to pick) and `ActivityHeatmap` (summary line, year picker, hover / tap
  card with the day's runs) in its own Activity card; `StatsTab` (/profile/stats with game_id: figures, co-op
  partners with "and N more", fewest portals; its own season picker). Legacy's Statistics card shared the Stats
  tab's `.pf-stats` class and so had a 24 px gap under its header; reproduced. Fixture `profile-stats.json`
  (partners trimmed to 4 of 19). Commit 050a21b. Tests: 13.
- 2026-10-18: 5.5b Points history chart (`features/profiles`): `utils/points-chart.ts` (samples plus each board's
  peak, what's in view, the shared scale from 0 and the per-line scales when zoomed, where a peak label goes),
  `PointsChart` (recharts lines, peak dots, the `?at=` day line, wheel zoom through the shared `useWheelZoom`, Reset
  zoom, legend toggles; click a day for the profile as it was then) in the Global Rank card. Legacy fell back to a
  history rebuilt from the player's runs when the endpoint failed; per D1 the chart now says it couldn't load, and
  the rebuild only feeds sample mode (`samplePointsHistory`). Clicking a day isn't testable under jsdom (recharts
  has no size there); the handler is the same `activeTooltipIndex` lookup as the WR chart's. Commit 3a825eb.
  Tests: 11.
- 2026-10-18: 5.5a Profiles (`features/profiles`): `utils/profile.ts` (ports of adaptProfile, scoresFromRanks,
  mergePbs, profileAsOf), `api/profile.ts` (profile = /profile + /user + the player's changelog + personal bests in one
  query; points peak; /profile/at; another game's /ranks/game + changelog), `ProfilePage` (as-of banner with "Back to
  today", Collapse all, the card rows), `ProfileHeader` (role colour and icon, badges incl. banned / frozen, country,
  Steam / Twitch / YouTube, compare and edit links; `actions` / `after` slots for follow and staff tools),
  `profile-stats.tsx` (points with role bars, global rank linking to the boards on the player's row, statistics,
  average place, world records, peak points), `ProfileTabs` (Singleplayer / Cooperative or the game's tab, Legacy,
  Info; seasons picked in the tab; sort orders), summary tiles, chapter tables (Run Details slot), history, Legacy
  and Info tabs. The route keys the page by player and fills the Run Details slot. Sample data: profile, user,
  scores and Mel ranks (port of mockProfile). Fixtures `profile-*.json` captured from the local API, trimmed to 10
  personal bests. Still to come: points chart (5.5b, the Global Rank card's `chart` slot), activity heatmap and the
  Stats tab (5.5c, the tab shows nothing until then), follow and staff tools (5.5d). Not compared in a browser this
  session. Commit c1962ac. Tests: 26 (+1 route, +1 sample data).
- 2026-10-18: 5.4b Aggregated boards: `/leaderboard/mel/$kind`, `/leaderboard/chapter/$chapterId` (kicker
  "Singleplayer · Chapter 1" / "Cooperative · Course 1", the chapter picked in the list, a season pick opens the
  mode's season board), `/leaderboard/game/$gameId` and `/$board` (custom games asked for by the chapters' game_mode,
  their own tabs; built-in games and unknown boards redirect; an old season address opens its game's board with the
  season picked, keeping the query). `chapterTarget` / `gameTarget` in `utils/pages.ts`. These redirects need the
  catalog, so they happen from the page (`<Redirect>`), not in `beforeLoad`. Commit 25910a6. Tests: 12 (+10
  redirect rows, +4 route rows).
- 2026-10-18: 5.4a Aggregated boards, Portal 2 (`features/aggregated`): `utils/points.ts` (`adaptPoints`,
  `serverBoard`: which `/points/game/{id}/{board}` and how many maps a Time entry needs), `utils/pages.ts` (what
  each address shows: title, kicker, season copy of the board, `/leaderboard/season` -> the running season or "No
  season yet", unknown board -> overall; the tabs per game), `api/aggregated.ts`, `PointsBoard` (20 a page,
  `?player=` opens on that player's page with the row marked, own row tinted), `AggregatedPage` (season, chapter and
  country pickers, tabs keeping country and season). `/leaderboard/$kind` uses it; the shared code already handles
  Mel, chapters, custom games and seasons, whose routes come in 5.4b. Sample data: `samplePoints` (port of
  `mockAggregated`). Fixture `points-sp.json` captured from the local API. Not compared in a browser this session.
  Commit cd183b1. Tests: 31 (+4 route rows).
- 2026-10-18: 5.2d Wall of Shame (`features/leaderboards`): `api/wall-of-shame.ts` (GET /wall_of_shame, sorted by
  name ignoring case and accents, as legacy), `WallOfShamePage` (search by name or Steam id, "N banned players" /
  "M of N" count, empty and no-match messages, cards linking to profiles), route loader prefetch. Sample data: the
  last three sample players, as legacy's mock; default test handler answers an empty list. Node isn't installed in
  this WSL session, so the tooling ran inside the dev compose's `web` container (`docker exec -w /app
  p2boards-web-1 ...`). Not compared in a browser this session (no browser tool); the layout is a direct port of
  WallOfShame.css. Commit d2f476b. Tests: 5.
- 2026-10-17: 5.2b-c Map page (`features/leaderboards`): redirects (unknown map, wrong mode, season copy, season
  without the map), info panel with the WR history chart (ranges, wheel zoom via shared `hooks/use-wheel-zoom.ts`,
  click for `?at=`), video, wiki/history buttons, board with search, pagination, Your best (profile scores fallback
  via shared `lib/runs/profile-scores.ts`), as-of banner, Run Details slot; Chamber History with filters; staff WR
  history editor (hidden for players and view-as-player). Shared `components/redirect.tsx` (TanStack `<Navigate>`
  looped on the unknown-map redirect). Checked against legacy at 1440 and 375 px: every measured box matches.
  Commit c9a1553. Tests: 19.
- 2026-10-17: 5.2a Map list (`features/leaderboards`): `MapListPage` (season and mode controls, chapters/courses,
  old `?game=<season>` links), `MapCard` (image header, WR row, next six, fixed icon columns, own runs tinted),
  `api/previews.ts`. Shared `components/season-select.tsx`; selects got an `xl` (46 px) size. The address keeps only
  mode and season, as legacy. Checked in the browser: at 1440 px the controls, chapter header, grid and card geometry
  match legacy; at 375 px the two-card grid, mode buttons and first-two-rows cards match. Commit a0c0342. Tests: 7.
- 2026-10-17: 5.1c Read-only Run Details (`features/runs`): video (autorender / YouTube / request), co-op half switch,
  mtrigger segments, comment and info, timer-rounding note, demo / YouTube / autorender buttons, with legacy's
  container-query layout (`@container/run-details`). The index route fills Score Updates' `renderRunDetails` slot.
  Reactions, report, pending proof and staff tools come in 5.3 as children of the same panel. Checked in the browser:
  at 1440 px the three columns, video and buttons match legacy (legacy is 28 px taller only by its Report link).
  Commit 253c3e9. Tests: 9 (+1 route test for the slot).
- 2026-10-17: 5.1b Score Updates panels: `RecapPanel` (Weekly recap / Daily chambers / Following tabs, week and day
  pagers keeping the previous data faded while the next loads, as legacy), `ActivityPanel` (month / year / all time
  chart), `api/panels.ts`. Sample data for /recap/weekly and /daily; empty defaults for the panels in the test
  handlers. Checked against legacy in the browser: at 1440 px the panel row, headers and pagers match and the score
  table starts at the same height; at 375 px the headers, pagers and switches match. Commit ca41dc2. Tests: 7.
- 2026-10-17: 5.1a Score Updates list. Shared run pieces: `lib/runs/changelog.ts` (legacy fetchChangelog's params,
  query options), `lib/runs/reactions.ts`, `lib/runs/video.ts`, `lib/autorender.ts`, `lib/rows.ts`,
  `hooks/use-rendered-set.ts`, `components/runs/run-media.tsx` (autorender / YouTube / demo / comment links, RunVideo)
  and `components/runs/time-button.tsx` (the history dialog behind every time). Feature `score-updates`: URL filters
  (`utils/filters.ts`, legacy semantics: defaults left out, toggles "1", page reset, other params kept), co-op half
  merging, `ScoreRow` (rank change, map with image, co-op tints and PB marks in both styles, time button, deltas,
  date, reactions, status), `RowReactions`, `ScoreFilters` (incl. the phone "More filters" fold), `ScoreUpdatesList`.
  `Select`/`Segmented` gained size options. Compared with legacy in the browser on sample data: at 1440 px every
  header and cell of the table matches to the pixel and the filter bar is the same height; at 375 px the two-line
  phone rows match too. Run Details is a slot (5.1c). Commit 145f2ac. Tests: 40.
- 2026-10-17: Step 4. A route file for every legacy URL (`src/app/routes/`), the redirects (`/leaderboard`,
  `/leaderboard/mel`, `/stats/times`, and `/compare` and `/more/countries` keeping their query), `/more/$page` and
  the root not-found page as the legacy Placeholder. Pages not built yet show `NotBuiltYet` with their title; each
  feature replaces its stub and adds its zod search schema. Commit 4570ca2. Tests: 36 route tests (every URL, every
  redirect with and without a query) + search-param tests.
- 2026-10-17: 3.15 Private mode: `components/layouts/private-gate.tsx` (port of PrivateGate: "Coming soon" with
  Steam sign-in back to the page, or "signed in as a non-staff account" with sign-out). The root loader now also
  loads `/site` and `/auth/me`. Like legacy, the gate checks the real role, so staff viewing as a player get in.
  `isStaff` returns a plain boolean (its type-guard form narrowed the false branch wrongly). Step 3 done.
  Commit 846cc64. Tests: 8 (public site, anonymous, player + sign-out, each staff role, view-as-player, banned).
- 2026-10-17: 3.14 Layout and top bar (`components/layouts`): `nav-model.ts` (Aggregate menu per game with chapters
  and seasons, active-page matching, game-switch paths, NAV and More), `top-bar.tsx`, `brand-menu.tsx` (game picker),
  `aggregate-menu.tsx`, `profile-menu.tsx`, `menu-parts.tsx`, `page.tsx` (background, tint, content column),
  `slots.ts` (Submit Run and staff inbox come from the app root, since layouts can't import features),
  `components/app-link.tsx`. Root route renders the top bar, the page and the sample notice. `npm run dev:mock` added.
  Checked side by side with the legacy site (both on sample data) by measuring layout in the browser: at 1440 px the
  top bar, nav links and Aggregate menu match legacy to the pixel; at 375 px the bar, phone menu rows and expanders
  match too, with no sideways scroll. Commit 128c893. Tests: 22 (menu model, roles, slots, theme, game switch).
- 2026-10-17: 3.13 Shared UI. shadcn primitives added (input, tabs, toggle(-group), dropdown-menu, dialog, sheet,
  tooltip, popover, separator, skeleton, native-select); `button` (outline + lg) and `native-select` (lg) restyled to
  the legacy controls. Shared components: `panel` (Panel, collapsible Card), `pagination`, `search-box`, `select`,
  `segmented`, `avatar` (+ Flag), `player-link`, `youtube-embed`, `rank` (RankNumber, RankChange), `status` (Loading,
  EmptyState, ErrorState), `icons`. Global utilities in index.css: `rank-tint`, `me-row`, `wr-glow`(`-raised`).
  `renderWithProviders`/`renderRoute` are now async and wait for the router to load. Stub `/profile/$profileId`
  route so links type-check. Commit c058b8c. Tests: 16.
- 2026-10-17: 3.12 Sample data mode. `src/testing/data/sample.ts` ports the legacy generators (players, boards,
  previews, changelog, activity) to raw API JSON, so sample data goes through the real adapters.
  `src/testing/mocks/sample-handlers.ts` serves them (built-in catalog, a signed-in sample player marked `sample`, 404
  for endpoints without sample data); `browser.ts` starts the worker. `main.tsx` loads it only when
  `import.meta.env.VITE_USE_MOCK === 'true'` and MSW's Vite plugin (worker script) is only added in that mode: a normal
  build was checked to contain neither the mock code nor `mockServiceWorker.js`, while a mock build emits the worker.
  `components/sample-data-notice.tsx` is the corner notice. Commit d2bead4. Tests: 8. Still to check in a browser
  once the layout exists (3.14).
- 2026-10-17: 3.11 `types/runs.ts` (raw changelog / sp + coop board / preview / co-op half types from the Rust
  models, and the UI `Run`, `RankedRun`, `PreviewRun`, `CoopHalf`, `Player`) and `lib/adapters/runs.ts`. Fixtures
  captured from the local API, one row per edge case (improvement, first run, banned, pending, co-op roles known and
  unknown, "N/A" filler, Mel, estimated date; co-op board rows with p1 host, p2 host, unknown, filler).
  `legacy-adapted-runs.json` is the legacy adapters' own output on those fixtures (generated by running the legacy
  code in Node), and the tests require the new adapters to match it. Commit 5fff31a. Tests: 9.
- 2026-10-17: 3.10 `lib/catalog/games.ts` (`gameFromLocation`, `selectedGame`, `baseGame`, branding with the built-in
  logos/background, board paths) and `hooks/use-game.ts` (`useGame`, `useGamePicker`, `setGame` on `p2cm.game`),
  `hooks/use-season.ts`. Commit cf15221. Tests: 27 (every address form, address beats saved choice, legacy saved
  game, remembering the address's game, branding overrides).
- 2026-10-17: 3.9 `lib/auth` (`/auth/me` + `/site` query options, `isStaff`, `isRoleAdmin`, `ROLE_LABELS`,
  `asViewed`, `steamLoginUrl`, `logout`), `hooks/use-current-user.ts`, `hooks/use-view-as-player.ts`. Test users for
  every role (`src/testing/data/users.ts`), `renderWithProviders`/`renderRoute` take `user` and `viewAsPlayer`, and
  default MSW handlers answer `/auth/me` (signed out) and `/site` (public). Commit 2e3b835. Tests: 12.
- 2026-10-17: 3.8 `lib/query-keys.ts` (a key for every resource legacy `client.js` fetches, resource name first),
  `lib/invalidate.ts` (`invalidateRun`, `invalidateUser`), and `hooks/use-coop-role-overrides.ts` (the co-op host
  overrides in the query cache). Commit cfb9afe. Tests: 4 (what each invalidation marks stale and leaves alone;
  overrides shared between readers).
  Correction: cfb9afe was committed with the overrides test failing (it didn't wait for Query's batched
  notifications); fixed in the next commit. Commits now go through a gate script that stops on any failure.
- 2026-10-17: 3.7 `lib/catalog`: raw `/catalog` types, `buildCatalog` (port of `applyCatalog`, immutable),
  `BUILTIN_CATALOG` (built-in Portal 2 / Mel with bundled images via `import.meta.glob`), selectors (maps, chapters,
  boards, `gameIdParam`, `pickableGames`), season helpers, `catalogQueryOptions` / `useCatalog`, and the root route
  loader. `lib/query-keys.ts` started with the catalog key. Fixture `src/testing/fixtures/catalog.json` captured from
  the local server (Portal 2, Mel, a custom game, a season). Commit 74c99f5. Tests: 26.
- 2026-10-17: 3.6 `lib/storage.ts` (legacy keys, try/catch, in-memory fallback when blocked, same-page and cross-tab
  change events) and `hooks/use-stored.ts` (`useSyncExternalStore`), with `use-theme`, `use-coop-pb-style`,
  `use-collapsed` (+ group), `use-follows`, `use-debounced`. `p2cm.game` and `p2cm.viewAsPlayer` get their hooks in
  3.9/3.10. Commit f9c0072. Tests: 13 (legacy values read back, formats written, blocked storage, sync between
  hooks and tabs).
- 2026-10-17: 3.5 `lib/data/countries.ts` (+ generated `country-table.ts`), `lib/data/roles.ts`, and the built-in
  map data for the catalog: `lib/catalog/builtin-chapters.ts` and `bsp-names.ts`, generated from the legacy files
  (239 countries, 108 BSP names, 60 sp + 48 coop + 22 story + 18 advanced maps, same as legacy). Seasons helpers
  depend on the catalog and move to 3.7. Commit 7694f3b. Tests: 27 (roles, role progress, countries).
- 2026-10-17: 3.4 `lib/activity.ts`, `lib/admin-actions.ts` (generated from the legacy tables), `lib/youtube.ts`,
  `lib/scroll.ts`. `pointsForRank` was done in 3.2 (`lib/points.ts`). Commit 6870ddb. Tests: 24 (activity
  windows checked against legacy summaries, YouTube link forms, action labels/tones, scroll timing and jump).
- 2026-10-17: 3.2-3.3 `lib/format.ts`, `lib/points.ts` (`pointsForRank`), `lib/ranks.ts`, `lib/run-filters.ts`,
  `lib/coop-roles.ts`. Expected values were produced by running the legacy functions in Node. Commit 2384e56. Tests:
  108 cases (scores, deltas, timestamps, time ago, dates, ordinals, points, rank colours on both scales, tile
  rainbow, filter options, co-op role overrides).
- 2026-10-17: 3.1 `lib/api-client.ts`: `api.get/post/put/delete`, `request()` (status + data, for the inbox long
  poll), `ApiError`, `apiUrl`. Commit 7419168. Tests: param dropping, credentials + JSON body, multipart upload,
  five error-body shapes, 204 status, link URLs (10).
- 2026-10-17: Step 2h. Dockerfile (Node 24, `VITE_API_URL`, copies `dist/`), nginx.conf copied with `/static/` ->
  `/assets/`, security headers copied, compose back on `./frontend`, dev compose runs `npm run dev -- --port 3000`.
  Built the image and ran it: SPA fallback, CSP and the immutable `/assets/` cache all as before. Commit d192cc9.
- 2026-10-17: Steps 2a-2g. Vite 8 + React 19 + TS 6 (strict, `noUncheckedIndexedAccess`, `@/` alias), Tailwind 4 +
  shadcn (radix-nova) with the legacy Figma palette as theme tokens, TanStack Query + Router (file routes in
  `src/app/routes/`, tree generated to `src/app/routeTree.gen.ts`), zod-validated env (`src/config/env.ts`), ESLint
  with the import-boundary zones (checked with throwaway cross-feature imports: both rules fire), Prettier, Vitest +
  RTL + MSW (`renderWithProviders`, `renderRoute`), dev proxy, public assets, theme.js and images. Commit 535adf2.
  Tests: app shell smoke test, env parsing (4).
- 2026-10-17: Step 1. Branch `frontend-rewrite` from `v2-redesign` (0b3120f). Moved `frontend/` to
  `frontend-legacy/` with history, pointed compose (prod and dev) at it, updated README, CLAUDE.md and the
  security-headers path in BACKEND_CHANGES.md. Commit 269197e. No tests (no code yet).

## Decisions and findings
<!-- Legacy behaviours discovered, choices made and why. -->
- Staff tier changes are sent without the reason, as legacy did (`act(() => setProfileRole(...))` dropped it); the
  other profile actions send it.
- Profile rank tiles: legacy's `.rank-tint` in Profile.css is a tinted tile; the new `rank-tint` utility is legacy's
  text-only `.rank-colored`. The tile is the new `rank-tile` utility.
- Profile chapter tables hand the score to Run Details without players (legacy passed `run={s}`); only the Legacy
  tab adds the player and partner. Kept so.
- Profile: like legacy, picking a day on the chart or "Back to today" replaces the whole query (drops ?season=).
- Shared `components/bubble.tsx` (+ `lib/bubble.ts` for its anchor): the comment bubble, now also the role bar's
  hover label (legacy used the same `.comment-bubble` for both).
- Aggregated map counts: legacy hard-codes 108 / 60 / 48 (Portal 2) and 40 / 22 / 18 (Mel) for the built-in boards
  and counts catalog maps for chapters and other games; kept so (`serverBoard`).
- Aggregated country picker: legacy's `setParams({ country })` replaces the whole query, so picking a country on a
  season board drops `?season=` (and `?player=`) and shows the all-time board. Kept for parity; listed under
  Follow-ups in FRONTEND_REWRITE.md.
- Tooling in this WSL session: no Node on the host, so tests, typecheck, lint and format run in the dev compose's
  `web` container: `docker exec -w /app p2boards-web-1 npx vitest --run` (and `npm run ...`).
- Nine "request without a matching handler" MSW warnings (changelog, profile scores) were already printed by
  older tests before 5.4a; they don't fail the suite. Worth silencing when those features are revisited.
- Theme: legacy is dark by default and sets `data-theme="light"` on `<html>` for light (`p2cm.theme`). The new CSS
  keeps that: the dark values sit on `:root`, the light ones on `:root[data-theme="light"]`, and Tailwind's `dark:`
  variant means "not light". shadcn's token names (`--background`, `--primary`, ...) point at the legacy tokens.
  `--border`/`--accent`/`--card` were legacy names too; the legacy ones are renamed `--line`, `--brand`,
  `--card-surface` to free the shadcn names.
- Font: Barlow Semi Condensed is self-hosted through `@fontsource` instead of Google Fonts. Looks the same, and needs
  no third-party request.
- Tooling versions: ESLint is pinned to 9 because `eslint-plugin-import` doesn't support 10 yet. MSW 3 renamed
  `onUnhandledRequest` to `onUnhandledFrame`. Tests fail on any request without a handler.
- Node: Vitest 5, jsdom and MSW 3 need Node 22.12+, so the Docker images use `node:24-bookworm` (legacy used 20) and
  `package.json` declares `engines`.
- Error messages: the server answers errors as `{ "error": "..." }` (ServerError) or as plain text (most handlers'
  `.body("No such run.")`). `ApiError.message` is that text; HTML proxy pages are replaced with legacy's wording
  ("The server took too long to answer." for 504/524, "Sign in required." for an empty 401).
- Upload tests: under jsdom, multipart bodies sent through MSW fail (the body Vitest's jsdom/Node fetch bridge sends
  doesn't match its Content-Length; plain Node and happy-dom are fine). jsdom stays the default environment; test
  files that upload files start with `// @vitest-environment happy-dom` (e.g. `api-client.upload.test.ts`).
- Tests run with `TZ=UTC` (set in vitest.config.ts) so local-time formatting is the same on every machine.
- Co-op role overrides: legacy keeps them in a module-level Map with a window event. The new `coopRoles()` takes the
  overrides as an argument; the overrides themselves will sit in the query cache (a hook, with the staff mutation
  writing to it), so rows update at once as in legacy. `tintFor` returns `'blue' | 'orange' | 'neutral'` and the
  components map that to classes.
- `countryById` returns `{ id, code, name }` (legacy left out `id`); callers only read `code`/`name`.
- Settings hooks: legacy had a listener set per hook plus a window event. The new ones all read localStorage through
  one `useSyncExternalStore` hook, so there is no module-level store; the only module state is the in-memory copy
  of values that couldn't be stored (blocked storage), which legacy kept in component state.
- Catalog: the query keeps the raw response and `select: buildCatalog` builds the site's catalog from it.
  `useCatalog()` returns the built-in Portal 2 / Mel data while it loads or when it fails (legacy did the same:
  one try with a 4 s timeout, no retry). The root loader awaits it so the first page doesn't render without it, as
  legacy blocked the first render. Selectors take the catalog as their first argument instead of reading a global.
- The fixture's custom game ("Bexc is BALD", a staff test game) was given neutral names; the shape is unchanged.
- Invalidation is deliberately wide: a run can be copied to linked maps and seasons by DB triggers and moves points for
  everyone on the map, so `invalidateRun` marks every board, ranking and stats list stale, plus the run, its co-op
  halves and its players' profiles. Only queries on screen refetch at once, so this costs little.
- `adaptPoints` (aggregated boards) and the profile adapters aren't shared run rows; they move with their features.
- Checked while porting: `/changelog` returns `admin_note`, but the server selects `NULL` for it, so no staff note
  reaches the browser.
- Sample data covers the endpoints the early features use; aggregated, profile, stats and the rest get sample data
  with their features. Until then those pages show their error state in sample mode.
- The notice keeps the legacy text "Sample data · API offline", which legacy also showed with `REACT_APP_USE_MOCK`.
- Icons: legacy used `@mui/icons-material`, which the plan rules out. `components/icons.tsx` keeps the legacy names and
  maps them to the closest lucide icons; lucide 1.x has no brand icons, so YouTube and GitHub are drawn as SVGs like
  Steam, Discord and Twitch. The glyphs look slightly different; the user accepted this as D2 (2026-10-18), icon
  polish comes after the port.
- `ErrorState` is new: it is what pages show where legacy fell back to sample data (D1).
- Line height: legacy never set one (browser `normal`); Tailwind's preflight uses 1.5 and every `text-*` size carries
  its own. index.css sets `html { line-height: normal }` and the `--text-*--line-height` theme values to `normal`,
  which brought the measured heights in line with legacy. Use `leading-*` where something needs a set line height.
- Top bar flag: legacy shows `user.country`, but `/auth/me` has no country, so only the sample player (mock mode)
  ever had a flag there. The new top bar leaves it out; on the real site that is the same as legacy.
- Phone menu: legacy hides every Aggregate flyout (chapters and seasons) on narrow screens; kept so.
- Menu state that legacy reset in an effect on route change (phone menu, game picker) is keyed to the page instead,
  which the React hooks lint prefers; it closes on navigation as before.
- Search params: TanStack Router's default parser JSON-parses query values, which turned `?a=76561198000000001` into a
  number and lost digits (caught by the `/compare` redirect test). The router (and the test routers) use
  `lib/search-params.ts`: values stay text, URLs stay plain like legacy's, and route schemas coerce where needed.
- Shared run code: the run history dialog, media links and the changelog query are used by Score Updates, the map
  page and profiles, so they live in `lib/runs`, `components/runs` and `hooks/`, not in one feature.
- Reactions in a row keep their own counts after a click (as legacy did) rather than refetching the list.
- Autorender share ids are cached per set of ids in the query cache (legacy had a module-level Map).
- Segmented switches below 700 px: legacy's MapList.css (`.segmented button { flex: 1; min-width: 0; padding: 0 12px }`
  at max-width 700) is in every page's bundle, so it applied to every switch site-wide. `Segmented` reproduces that
  (measured identical: 106 / 65 / 59 px buttons on the home page at 375 px).
- The activity chart measured 9 px wider than legacy's in the hidden browser pane: ResizeObserver doesn't run while
  nothing paints, so the first measurement sticks. Not a code difference; recheck with the pane visible.
- Map cards: legacy's real `/sp`/`/coop` previews carry no demo id, so there is no demo column on the real site; only
  legacy's sample data showed one. Maps missing from the previews show an empty record row (legacy only said "No
  scores yet" for an empty group, which the API never sends).
- Browser checks: after changing the emulated viewport size of a hidden tab, reload before measuring; styles of
  existing elements can stay stale until then.
- Map board rows: legacy's two stripe rules tie on specificity and the later (translucent panel) one matches every
  entry, so the board is not striped; chamber history and the WR editor are (first row = row colour). Kept so.
- Staff reasons: legacy and the server treat the reason as optional; the user decided to keep it optional (2026-10-18).
- `cn` in `lib/utils.ts` is shadcn's own package (github.com/shadcn-ui/cn), the replacement for clsx + tailwind-merge.
- The hardening merge added a CSP in `security-headers.conf` (no inline scripts) and `public/theme.js` (sets the
  theme before first paint without an inline script). The new app keeps both: nginx includes the same headers file,
  and `index.html` loads `theme.js` as a file. Vite's production build doesn't inline scripts, so no extra flag is needed.
- `frontend/` itself couldn't be renamed on Windows (a process held it as its working directory), so its contents
  were moved with `git mv` instead. The history is the same.
- Pushing: FRONTEND_REWRITE.md says don't push unless asked, so commits on this branch stay local until the user asks.

## Blocked / questions
<!-- Things waiting on the user. -->
