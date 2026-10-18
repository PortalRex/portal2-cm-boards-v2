# CLAUDE.md

Guidance for agents working in this repository.

## What this project is

**Portal 2 Challenge Mode Leaderboards (board.portal2.sr)**: a rewrite of the community leaderboards for Portal 2
Challenge Mode, with Portal Stories: Mel as a second game. Players compete for the fastest times and fewest portals
on each single-player and co-op chamber. The site:

- Shows **leaderboards** per map (top scores, world records, rank colours), with aggregated boards (overall /
  single-player / co-op points and times), per-country stats, and a "wall of shame" for banned runs.
- Shows **latest scores** (score updates / changelog) with filters, WR history and weekly recaps.
- Lets players **submit runs** by uploading a demo. The server parses it (map, scoreboard time, players), checks proof
  rules and saves the demo. Videos and comments can be attached.
- Has **player profiles** with PBs, points history, an activity heatmap, demo stats and co-op partners, plus
  player-vs-player comparison.
- Syncs new Portal 2 times from **Steam's leaderboards** automatically. Mel has no public Steam boards, so Mel
  times come only from demo submissions. Until the old boards are retired, it also pulls from them.
- Signs users in with **Steam**. Staff roles (verifier / moderator / admin) moderate runs (ban, verify, delete, pair co-op
  halves), handle anonymous **run reports**, manage the **game catalog** (games, seasons, chapters, maps,
  categories, linked leaderboards) and watch background jobs. Every admin action goes to an audit log.

## Repository layout

| Path | What it is |
|---|---|
| `server/` | Main REST API (Rust, actix-web 4, sqlx 0.8 / Postgres). Served under `/api/v1`. |
| `server/demo-parser/` | Node 18+ scripts the server calls to parse submitted `.dem` files. |
| `backend/` | Rust service that talks to Valve's API: fetches Steam leaderboard scores, updates avatars, calculates points, and pushes results to `server` using `X-Service-Token`. |
| `db/dbscript/schema.sql` | Full schema for fresh databases. |
| `db/dbscript/migrations/` | Timestamped migrations for existing databases, applied in filename order. |
| `db/dbscript/*.py` | Import / maintenance scripts (old boards, autorender, demo stats). |
| `frontend/` | The new website, on the stack below. The rewrite follows [FRONTEND_REWRITE.md](FRONTEND_REWRITE.md). Before working on it, read [REWRITE_PROGRESS.md](REWRITE_PROGRESS.md) and keep it updated. |
| `frontend-legacy/` | Old CRA site, reference only, do not modify. Treat its code as a reference for behaviour and API usage, not as a pattern to copy. |
| `board-portal-2/` | Legacy frontend from upstream. Do not modify. |
| `README.md`, `BACKEND_CHANGES.md` | Config reference and the changelog of server/DB/backend changes. Keep `BACKEND_CHANGES.md` up to date when you change the backend. |

Run everything with Docker: `docker compose up -d` (db + server + nginx site on :3000). For hot-reload frontend dev, use
`docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up -d`. Without Docker, run `cargo run` in `server/`
and `backend/` with a `.env` copied from `.env.example`.

---

## Frontend

### Stack

- **React + Vite** with **TypeScript** in strict mode. No `any` unless the reason is commented.
- **Bulletproof React** project structure (see below).
- **TanStack Query** for all server state. **TanStack Router** for routing, using file-based, type-safe routes
  and validated search params.
- **shadcn/ui** for components. Components are copied into the repo, so restyle them by editing the component or
  the theme tokens, not by wrapping them in one-off overrides. Use Tailwind with CSS variables for theming
  (light/dark), and add new primitives with the shadcn CLI.
- **Lucide** (`lucide-react`) for icons, the shadcn default (`iconLibrary` in `components.json`). Don't add a second
  icon library. For brand logos Lucide lacks (Steam, YouTube), use a small inline SVG or a file in `assets/`.
- **Vitest + React Testing Library + MSW** for tests.

### Structure (Bulletproof React)

```
src/
  app/              # App shell: providers (QueryClient, Router, theme), router setup, root layout
    routes/         # TanStack Router route files. Keep them thin: parse params, prefetch, render a feature component
  assets/
  components/       # Shared, feature-agnostic components
    ui/             # shadcn primitives (button, dialog, table, ...)
    layouts/
  config/           # env (validated), constants
  features/         # One folder per domain feature
    leaderboards/
    score-updates/
    runs/           # run details, submission, reports, reactions
    profiles/
    compare/
    aggregated/
    countries/
    stats/
    auth/
    admin/          # moderation, reports inbox, catalog editor, jobs
  hooks/            # Shared hooks
  lib/              # Configured libraries: api-client, query-client, utils (cn, formatting), plus shared
                    # data used by many features: catalog/ (games, chapters, maps from /catalog), auth/,
                    # query-keys.ts and invalidate.ts (see FRONTEND_REWRITE.md)
  testing/          # Test utils, MSW handlers, data factories
  types/            # Shared API types
```

Each feature contains only the folders it needs:

```
features/<name>/
  api/          # Fetchers + query/mutation hooks + query keys for this feature
  components/
  hooks/
  types/
  utils/
  index.ts      # Optional public surface
```

Rules:

- **Imports go one way: `shared → features → app`.** A feature must not import from another feature. If two
  features need the same thing, move it to shared `components/`, `hooks/`, `lib/` or `types/`, or compose them
  in a route. Enforce this with ESLint `import/no-restricted-paths`.
- Use absolute imports through the `@/` alias.
- Keep components small and reusable. Split a component once it fetches *and* renders complex UI. Pass data in
  through props so components stay testable.
- No CSS files per component. Style with Tailwind classes and the theme tokens.

### Data fetching (TanStack Query)

- Use a single `lib/api-client.ts` (fetch wrapper) everywhere. It sets the base URL `/api/v1` (`VITE_API_URL`),
  sends `credentials: 'include'` (Steam session cookie) and turns non-2xx responses into typed errors. Never call
  `fetch` directly from a component.
- In each `features/*/api/` folder, export a plain fetcher, a `queryOptions(...)` factory and a hook for every
  endpoint:
  ```ts
  export const getMapScores = (mapId: string, params: MapScoreParams) =>
    api.get<MapScore[]>(`/map/sp/${mapId}`, { params });

  export const mapScoresQueryOptions = (mapId: string, params: MapScoreParams) =>
    queryOptions({ queryKey: ['maps', mapId, 'scores', params], queryFn: () => getMapScores(mapId, params) });

  export const useMapScores = (mapId: string, params: MapScoreParams) =>
    useQuery(mapScoresQueryOptions(mapId, params));
  ```
- Use route `loader`s to prefetch with `queryClient.ensureQueryData(...)` so navigation doesn't flash an empty page.
- Mutations invalidate the query keys they affect. After a moderation action, invalidate both the run and the
  board it belongs to.
- Write API types to match the Rust models' JSON exactly (snake_case fields, Steam IDs and map IDs as **strings**).
  Never parse a Steam ID to a number, because it overflows JS numbers.
- The selected game (Portal 2 / Mel / seasons) applies to the whole site. Store it in one place (router search param or
  context) and include it in the query keys, not as a separate dropdown on each page.

### Routing (TanStack Router)

- Validate search params with a schema (zod) and treat them as state for filters, pagination and the selected game.
- Wrap admin routes in a `beforeLoad` guard that checks the current user's role. Also hide staff UI when the
  "view as player" setting is on. The server still enforces permissions, so the guard only controls what is shown.

---

## Code style

Applies to all code, frontend and backend.

- **Formatting:** frontend code follows **Prettier** (config in `frontend/.prettierrc.json`). Run `npm run format`
  and don't hand-format against it. Rust uses `cargo fmt`.
- **Readable first.** Write code the next person can follow at a glance: clear names, small functions, early returns
  over deep nesting, comments only for the *why*. Match the style of the surrounding code.
- **Avoid duplication.** Before writing something new, look for an existing helper, component, hook or query
  factory. When the same logic appears a second time, extract it (frontend: shared `components/`, `hooks/`, `lib/`
  or a feature's `utils/`; backend: a shared controller or tool function) instead of copying it.

---

## Backend (`server/` and `backend/`)

The basic structure is in place. Follow it and don't restructure it.

### `server/` layout and conventions

- `src/api/v1/handlers/<area>.rs`: HTTP endpoints only. Use one actix macro handler per endpoint
  (`#[get("/maps")]`) and register it in **`handlers/init.rs`** (the `/api/v1` scope). A handler extracts its inputs,
  calls a model method and returns `web::Json(...)`.
- `src/models/<area>.rs`: data structs (`serde` + `sqlx::FromRow`) and query param structs.
- `src/controllers/<area>.rs`: database code, written as `impl Model { pub async fn ...(pool: &PgPool, ...) }`.
  Write the SQL by hand in `sqlx::query_as` / `query_scalar` with `.bind(...)`. **Never build SQL by formatting
  strings with user input.**
- `src/tools/`: config (`config.rs`, read from `.env` with `SECTION.KEY` names), errors, auth, cache, rate limiting,
  background jobs, Steam / old-boards sync.
- Handlers return `crate::tools::error::Result<T>`. Map failures through `ServerError` / `ErrorType`. Internal details
  are logged and never sent to the client.
- Auth is done with extractors. Use `MaybeUser` for optional sign-in, `SignedIn` when the user must be signed in, and
  `AdminOrService` for any endpoint that changes data (a signed-in admin or `X-Service-Token`). State-changing requests from
  the browser must also pass the `origin_ok` check.
- Admin/moderation actions write to the audit log through the existing moderation helpers, and refresh any caches
  they touch (`CacheState`, points cache).
- Document every handler with a doc comment that gives the method, parameters, example endpoints and example
  JSON, as the existing handlers do.
- **Schema changes:** add a new timestamped file to `db/dbscript/migrations/` (`YYYYMMDDHHMMSS_name.sql`), make the
  same change in `db/dbscript/schema.sql`, and add an entry to `BACKEND_CHANGES.md`. Never edit a migration that has
  already been applied. Linked leaderboards and seasons depend on DB triggers
  (`20261021000000_games_seasons.sql`), so check them when you touch `changelog`, `coop_bundled` or `maps`.
- Pinned crate versions (`=x.y.z`) are intentional. Don't bump them unless the task requires it.
- Run `cargo fmt` and `cargo clippy` before finishing.

### `backend/`

A separate Rust service in `stages/` (fetching → uploading → exporting, split sp/coop) that calls `server`
endpoints with `SERVICE_TOKEN`. It has no database of its own. Keep that boundary: it calls the server's API
and never connects to the database.

---

## Testing: required, continuous

Every change ships with tests. A feature or fix is not done until tests covering it exist and the whole suite passes.
The goal is that a change in one place cannot silently break another.

### Frontend

- Use **Vitest + React Testing Library** with `@testing-library/user-event`, and **MSW** to mock the API at the
  network level. Don't mock `api-client` or the query hooks.
- Put each test next to the code it tests (`*.test.ts(x)`). Shared render helpers (with QueryClient + Router
  providers), MSW handlers and data factories go in `src/testing/`.
- What to cover:
  - `lib/` and feature `utils/`: unit tests for formatting (times like `2243 → 22.43`, `11783 → 1:57.83`), ranks,
    points and filters.
  - `api/` hooks: success, error and empty responses, and that query keys/invalidation behave as expected.
  - Components and routes: user-visible behaviour such as rendering, filtering, pagination, the submit-run flow,
    admin guards, and what a regular player sees compared with staff.
- Test what the user sees (roles, labels, text), not implementation details.
- Commands: `npm run test` (watch), `npm run test -- --run` (CI), `npm run typecheck`, `npm run lint`.
- The full frontend suite is slow (minutes) and some tests time out under its load. Don't run it after
  every change: run only the test files the change could affect (`npx vitest --run <files>`), e.g. the
  tests next to the edited files and those of the components that use them. Run the full suite only
  when asked or for wide-reaching changes.

### Backend

- Put **pure logic** (formatting, parsing, ranking, points, auth helpers, config parsing) in `#[cfg(test)] mod tests`
  inside the same file, as in `controllers/submissions.rs` and `tools/auth.rs`.
- **Database tests** go in `server/src/tests/` (`db_tests.rs`) with `#[actix_web::test]` and need a running Postgres
  from `DATABASE_URL`. New DB tests must create the rows they need and clean them up, and must not rely on
  hard-coded IDs from a production dump. The existing tests do rely on them, which is a known TODO.
- **Endpoint tests:** use `actix_web::test::init_service` with the routes from `init` to check status codes, JSON
  shape and permission rules. Every mutating endpoint needs a test showing it rejects anonymous / non-admin
  callers.
- `backend/` tests live in `backend/src/tests/`, using the JSON fixtures in `tests/examples/`.
- Commands: `cargo test` in `server/` and in `backend/`.

### Before you finish a task

1. Run the tests for every part you touched (frontend and/or `server` / `backend`), not only the new tests. For the
   frontend, that means the affected test files rather than the whole suite (see Testing → Frontend).
2. Format, typecheck and lint (`npm run format && npm run typecheck && npm run lint`, `cargo fmt && cargo clippy`).
3. If an API response shape changed, update the frontend types, MSW handlers and tests in the same change.
4. Report failures honestly. Never skip, delete or weaken a test to make it pass.
