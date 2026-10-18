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
- [x] 5. Features
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
  - [x] 5.6a Stats: Runners tab: a2459af
  - [x] 5.6b Stats: Records, History, Race tabs: f31bed9 (fixed in the next commit)
  - [x] 5.6c Compare (`?a=&b=`, debounced player search): 2c31c0b
  - [x] 5.6d Countries: fc7d07b
  - [x] 5.3a Run Details: media (autorender, YouTube): 4b269c6
  - [x] 5.3b Run Details: reactions, reports: 62d30d3
  - [x] 5.3c Run Details: staff actions with reasons + invalidation: 0fc43fe
  - [x] 5.3d Submit Run (upload preview, submit, admin manual entry): d90dfe9
  - [x] 5.7 Settings (name/avatar locks, view-as-player for staff): 09d111c
  - [x] 5.8 About, Donators, Placeholder: 0287124
  - [x] 5.9a Admin: guard, layout, audit log: afea143
  - [x] 5.9b Admin: reports, background jobs: d55d54f (lint fix 6a7c9a5)
  - [x] 5.9c Admin: games editor (split into components): 739b30d
  - [x] 5.9d Staff inbox long poll: 0103cbe
- [ ] 6. Parity and cutover
  - [ ] 6.1 `frontend/PARITY.md`, every route x role x game x theme x phone: done for visitors (all routes, desktop /
    phone / light / Mel / breakpoints); signed-in and staff rows wait for real sign-ins (pending)
  - [x] 6.2 Settings carry over from legacy localStorage: (pending)
  - [x] 6.3 Final checks (old links, Docker builds, Steam sign-in via proxy, 50 MB uploads): (pending)
  - [ ] 6.4 Cutover (user approval, delete `frontend-legacy/`, docs)

## Log
<!-- Newest first. One entry per finished item: date, what was done, commit, tests added. -->
- 2026-10-18: Step 6. Parity pass against real data: legacy (:3001) and the new site (:3002) on one read-only
  server instance (:8082, same database, private mode and jobs off). Every visible element measured on both sides
  and lined up by text, for every route as a visitor at 1400px dark, 375px phone, 1400px light, Mel selected, and
  900 / 1320 / 700px, plus interactive states (run details, filters, paging, profile tabs, chamber history). Results
  in `frontend/PARITY.md`. Fixed along the way (commits 9ae745f, 91b6b31, 82cac34, 0103cbe): inclusive breakpoint
  variants (`upto900:`, widest first), the empty-value switch choice, Tailwind-reset defaults legacy relied on
  (`small`, code font, bullets, img max-width, browser button padding and paragraph margins, the race slider), narrow
  pages, icon sizes and shrink, switch transitions, and per-page cascade results. 6.2: the six legacy keys and
  formats are the same; `testing/legacy-settings.test.tsx` opens the site with them. 6.3: old links match, the
  production image builds and serves through nginx, both compose files validate, Steam sign-in returns to the
  forwarded host, 50 MB uploads pass and 70 MB get 413. Signed-in and staff views still need real sign-ins.
  Commit (pending). Tests: 1.
- 2026-10-18: 5.9d Staff inbox (`components/staff-inbox.tsx`, filled into the top bar's `staffInbox` slot from the
  root route): red badge for new entries (not your own), amber for open reports, the panel with each entry linking to
  its map, profile, the reports list or the log, opening marks them read (badge cleared at once) and highlights the
  new ones; closes on Escape, an outside click or another page. `hooks/use-staff-inbox.ts`: the inbox query (reloaded
  every 5 minutes while visible) plus the long poll on `/admin/inbox/wait`: it reads `after` / `seen` from the cache
  each round, writes the reloaded inbox with `setQueryData`, waits 10 s after a failure and aborts on unmount. Default
  test handlers answer an empty inbox and a wait that never returns. Tests: 6. Commit 0103cbe.
- 2026-10-18: 5.9c Games editor, split from legacy's 1,125-line file into `features/admin/components/games/`
  (`games-editor` list + panel host, `new-game-form`, `game-panel` with branding, `image-row` shared by game and map
  pictures, `game-modes` with `ModeSelect`, `game-links` with the season pool, `layout-editor` with chapter heads and
  add forms, `map-editor` with categories and links), `api/catalog-editor.ts`, and the pure helpers (slugs, mode
  keys, times, map / chapter moves) in `utils/catalog-editor.ts`. Every change refetches the catalog (the editor's
  and the site's, same query key) and reloads run data. The legacy sheet's cascade is worked out per element in
  `styles.ts`. Tests: 6 helper tests, 12 editor tests (2 under happy-dom for image uploads). Commit 739b30d.
- 2026-10-18: 5.9b Run reports (`components/reports.tsx`: open / resolved / dismissed / all, 50 per page, the run with
  its flags, details, resolve or dismiss with a note and optionally the run's other open reports, how a closed one
  ended, reopen; refreshes the reports, count, inbox, log and the run) and Background jobs
  (`components/background-jobs.tsx`: state, schedule, last run, Run now / Dry run in the background, polled every
  15 s and every 3 s while running; once a real run started here finishes, the site's run data reloads). Tests: 7.
  Commit d55d54f. It went out with a lint error (setState in an effect; my commit command didn't stop on the gate's
  failure). Fixed in the next commit: the finished-run check now runs in the jobs query's fetch. Commit 6a7c9a5.
- 2026-10-18: 5.9a Staff panel (`features/admin`): `/admin?section=` (log, reports, games, jobs; validated, and a
  section the user can't open shows the changelog, as legacy). Who sees what is legacy's: visitors are asked to sign
  in, players and staff viewing as a player get "Staff only.", reports for every staff tier with the open count,
  games and jobs for admins. The audit log: runs / profiles / games, action filter, 50 per page with Load more,
  details on demand, role changes, deleted runs struck through, and Undo for a ban or WR-history removal while the
  run is still hidden (logged as "Undo of #id"). `setRunBanned` / `setRunWrHidden` moved to `lib/runs/moderation.ts`
  (used by three features). Reports, jobs and games show "Not built yet" until 5.9b/c. Commit afea143. Tests: 10.
- 2026-10-18: 5.8 About (`features/about`, static, the points table from `pointsForRank`) and Donators
  (`features/donators`: GET /donators, biggest first then by name, total). The placeholder was already ported (2.x).
  Sample data now has legacy's five sample donators. Card text uses arbitrary font sizes so it inherits the cards'
  1.45 line height, as legacy's did (Tailwind's named sizes set their own). Compared with legacy at 1400px and 375px:
  every box matches. Commit 0287124. Tests: 5.
- 2026-10-18: 5.7 Settings (`features/settings`): theme and co-op PB style switches, name and picture (own, or back to
  Steam's; locked fields disabled with legacy's note), country (pick, or from the Steam profile with the server's
  reason when it has none), the staff view-as-player switch (keeps the real role while viewing as a player) and sign
  in / sign out. Changes call `invalidateUser`. Fixed in `<Page narrow>`: `max-w-content` and `max-w-[1240px]` were
  both set and the first won, so narrow pages (map page, aggregated boards, placeholders, Settings) were 1640px wide
  above 1288px viewports; checked against legacy at 1400px. Compared in the browser at 1400px and 375px (signed-out
  view: the sample user has no account sections in either site). Commit 09d111c. Tests: 11.
- 2026-10-18: 5.3d Submit Run (`features/runs/api/submissions.ts`, `components/submit-run.tsx`), filled into the top
  bar's `submitRun` slot from the root route: drop or pick a .dem, the server reads it (map link, time, co-op partner,
  players), the Mel board choice when one map file is on both boards, optional YouTube link and comment, then submit;
  the result names the map, the boards it counts on and whether it waits for the partner ("Submit another" starts
  over). Players can only submit demos they are in; admins get the manual entry (map, time, player, partner), with or
  without a demo. Blank fields are left out of the form, server messages are shown. Also `PendingProof` in Run Details
  (Add demo on a pending run for its players and staff; a co-op run keeps it until both demos are in). Submissions and
  added demos call `invalidateRun`. Tests: 15 (upload tests under happy-dom; the two full-app tests are in
  `submit-run-button.test.tsx` under jsdom, since under happy-dom the app made requests MSW couldn't match). Commit d90dfe9.
- 2026-10-18: 5.3c Staff tools in Run Details (`features/runs/api/staff.ts`, `components/staff-tools.tsx`), shown to
  any staff tier and hidden while viewing as a player: optional reason (audit log), ban / unban, verify / mark pending,
  admin-only remove demo and delete run (second click confirms, focus elsewhere cancels, the button keeps its size),
  partner by SteamID64 for co-op outside Mel, the co-op host picker (PUT /coop/{id}/host, then the role override so
  every row recolours), who reacted (loaded on open, with history) and staff notes (own notes deletable, admins any;
  the old board's notes show "The board"). Each action calls `invalidateRun`. Default test handlers for notes and the
  reaction record. Commit 0fc43fe. Tests: 15.
- 2026-10-18: 5.3b Reactions and reports in Run Details: `ReactionsBar` (counts for everyone, react / clear when
  signed in, cache updated from the answer; left out in Score Updates rows via `showReactions={false}`, as legacy)
  and `ReportRun` (anonymous report, reason required, details required for "Something else", null when empty,
  server message shown). `REPORT_REASONS` and `reportRun` live in `lib/runs/reports.ts` for the staff reports page.
  Default test handler for reaction counts. Commit 62d30d3. Tests: 6.
- 2026-10-18: 5.3a Run Details media. The pieces were already in place and wired on Score Updates, map boards and
  profiles (5.1a/5.1c and the profile work); this adds their own tests (`components/runs/run-media.test.tsx`: link
  states, share ids from the rendered set, demo/YouTube links, comment bubble, video source order and the
  both-sources-failed fallback, YouTube and render-request fallbacks). Fixed: labelled custom SVG icons (YouTube etc.)
  were still `aria-hidden`. Filled in the Countries hash. Commit 0287124. Tests: 7.
- 2026-10-18: 5.6d Countries (`features/countries`): `api/countries.ts` (/countries/stats per board) and
  `CountriesPanel` (players and points per country, best five players, each country linking to its board filtered
  to it; overall / single player / co-op switch). Like legacy the board is component state, not in the address, so
  `/more/countries?board=sp` still opens on Overall. `/stats/countries` route; default test handler answers an empty
  list. Commit 0287124. Tests: 2.
  Note: in one full run the map list's first test timed out at Vitest's 5 s default (the container was busy); it
  passes alone and in the next full run. Raise `testTimeout` if it keeps happening.
- 2026-10-18: 5.6c Compare (`features/compare`): `api/compare.ts` (player search via /users/search, one side = /user
  + Portal 2 personal bests, or another game's ranks with the latest run's time), `utils/summary.ts` (maps faster,
  ties, shared totals), `ComparePanel` (two player slots with a 250 ms debounced search and Change, swap, season
  picker incl. old `?game=<season>` links, mode switch, the summary and the map-by-map rows). `/stats/compare` keeps
  `?a=&b=&mode=&season=` in the address. Shared `lib/runs/player-runs.ts` (a player's runs, game ranks, latest run
  per map), now also used by profiles. Commit 2c31c0b (refactor c4c1e2c). Tests: 11 (+1 route row).
- 2026-10-18: 5.6b Stats Records / History / Race (`features/stats/components/wr-panels.tsx`, `race.tsx`): records
  per mode (`?mode=`) with totals and the share of records held now; history views (`?view=` longest, domination,
  improvements, record-days); the race (`?board=`, play / pause, month slider, bars sliding between places). Routes
  `/stats/records`, `/history`, `/race`. Below 900 px the tables keep every column, as legacy's (broken) phone rule
  did; listed under Follow-ups. Commit f31bed9. Tests: 14 (+4 route rows).
  Correction: f31bed9 was committed with three route-table tests failing (they still expected the placeholder's
  "Stats" heading) and a type error in a test cast; the command chain didn't stop on them. Fixed in the next commit.
  Commits now go through `npm run check` (prettier --check, the full test run, typecheck and lint, stopping on the
  first failure), run in the web container, and are made only when it exits 0.
- 2026-10-18: 5.6a Stats Runners (`features/stats`): `api/stats.ts` (/stats/site and /stats/wr with their adapters,
  ports of fetchSiteStats / fetchWrStats), `RunnersPanel` (totals, peak points per board in `?board=`, leader cards
  with record-days from the WR stats, longest-standing records), `stats-ui.tsx` (figures, section titles, striped
  tables, teams, map names, the 40 px switches). Shared `components/stats-shell.tsx` (the Stats tabs above the
  panel), used by the Stats, Compare and Countries routes. Legacy had no sample data for the stats endpoints; sample
  mode shows "Couldn’t load the stats." as legacy did. Fixtures `stats-site.json` / `stats-wr.json` captured and
  trimmed. Commit a2459af. Tests: 7 (+2 route rows).
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
- Parity: rows that tie (0-point countries and their top players, chamber history entries with the same time) come
  back from the server in a different order on each request, so the two sites can differ there, as can two loads
  of either. Follow-up for the server (not done, the API stays as it is): a tie-breaker in those `ORDER BY`s.
- Parity method: measurements of hidden browser tabs can catch CSS transitions at their start; the new switches had
  shadcn's 150ms transition, which legacy didn't, so it was removed rather than worked around.
- Staff inbox highlight: legacy's `.is-new` row used `var(--me-tint)`, which is only defined inside `.is-me`, so the
  background never showed; only the 3px brand edge did. Kept that.
- Games editor: legacy's whole sheet hung off `.ge` element rules (`.ge button`, `.ge input`), which outranked several
  class rules. Kept the visible results: the games list buttons have 0 14px padding, 15px text, a 4px radius and no
  hover; the season's "link to base" checkbox sits above its text (the form's label rule made it a column); a
  season's read-only map chips keep the draggable chips' colour and grab cursor. Like the rest of the staff panel it
  can't be compared with legacy on sample data.
- Staff panel guard: legacy doesn't redirect non-staff away from /admin; the page itself says "Sign in with an admin
  account…" or "Staff only.". Kept as is (FRONTEND_REWRITE: copy legacy's role checks exactly), so the route has no
  `beforeLoad` redirect. The section is now in the address (`?section=`, replace navigation) rather than page state;
  legacy already opened sections from `?section=`. While a new log kind or filter loads, the old rows are cleared
  (legacy kept showing the previous kind's rows under the new kind's columns until the answer came).
- Submit Run: like legacy, the button is hidden from the sample-data stand-in user, so neither site can show the dialog
  on sample data; the styling is ported from SubmitRun.css. Its cascade quirks are kept: `.sr-done p` (19px) outranks
  `.sr-muted`, so the notes on the result screen are 19px; the open admin `<details>` has both a 10px gap and a 10px
  top margin on each child. Mel advanced maps keep the built-in "Advanced …" titles in the map link, as legacy's
  `getMap` gave.
- Run Details staff tools: legacy's sample user is never staff (`isStaff` checks `!user.sample`), so the tools
  can't be compared on sample data. The styling comes from reading RunDetails.css: it loads after ui.css, so
  `.sd-admin button` outranks `.segmented button` and also styles the host picker (bordered, 32px tall in the 30px
  row) and the note Delete button (a normal admin button pushed right, not the muted text link its own rule asks for).
- Stats phone layout: legacy Stats.css (lines 462-476) has a selector list with no body that runs into
  `.st-hist .st-row { grid-template-columns: … }`, so below 900 px the columns it meant to hide still show and every
  element in that list gets a grid template. Reproduced the visible result (columns kept, the grids changed).
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
  `web` container: `docker exec -w /app p2boards-web-1 npm run check` (and `npm run format`, ...). `npm run check`
  is the commit gate: it exits non-zero on any failure.
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
