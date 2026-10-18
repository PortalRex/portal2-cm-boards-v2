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
- [ ] 3. Foundation
  - [x] 3.1 `lib/api-client.ts` (`api.*`, `ApiError`, `apiUrl`, param dropping, FormData): 7419168
  - [x] 3.2 Pure helpers: `format`: 2384e56
  - [x] 3.3 Pure helpers: `ranks`, `runFilters`, `coopRoles`: 2384e56
  - [x] 3.4 Pure helpers: `activity`, `adminActions`, `youtube`, `scroll`, `pointsForRank`: 6870ddb
  - [x] 3.5 Static data: `countries`, `roles`, built-in maps / bsp names / seasons: (pending)
  - [ ] 3.6 Per-browser settings (localStorage keys, try/catch) and theme
  - [ ] 3.7 `lib/catalog` (query options, selectors, built-in fallback, root loader)
  - [ ] 3.8 `lib/query-keys.ts` and `lib/invalidate.ts`
  - [ ] 3.9 `lib/auth` (`/auth/me`, roles, view-as-player) + `hooks/use-current-user`
  - [ ] 3.10 `hooks/use-game` (URL wins, saved choice, branding)
  - [ ] 3.11 Shared run model: `types/runs.ts` + adapters with captured fixtures
  - [ ] 3.12 Sample data mode: MSW handlers + factories, browser worker behind `VITE_USE_MOCK`, indicator
  - [ ] 3.13 Shared UI on shadcn (panels, tabs, selects, toggles, avatars, flags, score cells, icons)
  - [ ] 3.14 Layout + TopBar (nav, dropdowns, Aggregate menu per game, More menu, account area, theme toggle)
  - [ ] 3.15 Private mode gate in the root route
- [ ] 4. Routes: every legacy URL and redirect, thin route files with zod search params
- [ ] 5. Features
  - [ ] 5.1a Score Updates: list, filters/limits/toggles in search params
  - [ ] 5.1b Score Updates: daily chambers, weekly recap, graph
  - [ ] 5.1c Score Updates: inline Run Details slot (read-only Run Details)
  - [ ] 5.2a Map list (catalog images with built-in fallback)
  - [ ] 5.2b Map page: board, co-op halves, co-op PB style
  - [ ] 5.2c Map page: WR history with hidden WRs for staff
  - [ ] 5.2d Wall of Shame
  - [ ] 5.4a Aggregated: Portal 2 overall / sp / coop
  - [ ] 5.4b Aggregated: Mel, chapters, custom games and seasons
  - [ ] 5.5a Profiles: header, tabs per game, seasons in tab
  - [ ] 5.5b Profiles: points history chart with wheel zoom
  - [ ] 5.5c Profiles: activity heatmap, demo stats, co-op partners
  - [ ] 5.5d Profiles: follows; staff tools slot
  - [ ] 5.6a Stats: Runners tab
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
- 2026-10-17: 3.5 `lib/data/countries.ts` (+ generated `country-table.ts`), `lib/data/roles.ts`, and the built-in
  map data for the catalog: `lib/catalog/builtin-chapters.ts` and `bsp-names.ts`, generated from the legacy files
  (239 countries, 108 BSP names, 60 sp + 48 coop + 22 story + 18 advanced maps, same as legacy). Seasons helpers
  depend on the catalog and move to 3.7. Commit (pending). Tests: 27 (roles, role progress, countries).
- 2026-10-17: 3.4 `lib/activity.ts`, `lib/admin-actions.ts` (generated from the legacy tables), `lib/youtube.ts`,
  `lib/scroll.ts`. `pointsForRank` was done in 3.2 (`lib/points.ts`). Commit (pending). Tests: 24 (activity
  windows checked against legacy summaries, YouTube link forms, action labels/tones, scroll timing and jump).
- 2026-10-17: 3.2-3.3 `lib/format.ts`, `lib/points.ts` (`pointsForRank`), `lib/ranks.ts`, `lib/run-filters.ts`,
  `lib/coop-roles.ts`. Expected values were produced by running the legacy functions in Node. Commit (pending). Tests:
  108 cases (scores, deltas, timestamps, time ago, dates, ordinals, points, rank colours on both scales, tile
  rainbow, filter options, co-op role overrides).
- 2026-10-17: 3.1 `lib/api-client.ts`: `api.get/post/put/delete`, `request()` (status + data, for the inbox long
  poll), `ApiError`, `apiUrl`. Commit (pending). Tests: param dropping, credentials + JSON body, multipart upload,
  five error-body shapes, 204 status, link URLs (10).
- 2026-10-17: Step 2h. Dockerfile (Node 24, `VITE_API_URL`, copies `dist/`), nginx.conf copied with `/static/` ->
  `/assets/`, security headers copied, compose back on `./frontend`, dev compose runs `npm run dev -- --port 3000`.
  Built the image and ran it: SPA fallback, CSP and the immutable `/assets/` cache all as before. Commit (pending).
- 2026-10-17: Steps 2a-2g. Vite 8 + React 19 + TS 6 (strict, `noUncheckedIndexedAccess`, `@/` alias), Tailwind 4 +
  shadcn (radix-nova) with the legacy Figma palette as theme tokens, TanStack Query + Router (file routes in
  `src/app/routes/`, tree generated to `src/app/routeTree.gen.ts`), zod-validated env (`src/config/env.ts`), ESLint
  with the import-boundary zones (checked with throwaway cross-feature imports: both rules fire), Prettier, Vitest +
  RTL + MSW (`renderWithProviders`, `renderRoute`), dev proxy, public assets, theme.js and images. Commit (pending).
  Tests: app shell smoke test, env parsing (4).
- 2026-10-17: Step 1. Branch `frontend-rewrite` from `v2-redesign` (0b3120f). Moved `frontend/` to
  `frontend-legacy/` with history, pointed compose (prod and dev) at it, updated README, CLAUDE.md and the
  security-headers path in BACKEND_CHANGES.md. Commit (pending). No tests (no code yet).

## Decisions and findings
<!-- Legacy behaviours discovered, choices made and why. -->
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
- `cn` in `lib/utils.ts` is shadcn's own package (github.com/shadcn-ui/cn), the replacement for clsx + tailwind-merge.
- The hardening merge added a CSP in `security-headers.conf` (no inline scripts) and `public/theme.js` (sets the
  theme before first paint without an inline script). The new app keeps both: nginx includes the same headers file,
  and `index.html` loads `theme.js` as a file. Vite's production build doesn't inline scripts, so no extra flag is needed.
- `frontend/` itself couldn't be renamed on Windows (a process held it as its working directory), so its contents
  were moved with `git mv` instead. The history is the same.
- Pushing: FRONTEND_REWRITE.md says don't push unless asked, so commits on this branch stay local until the user asks.

## Blocked / questions
<!-- Things waiting on the user. -->
