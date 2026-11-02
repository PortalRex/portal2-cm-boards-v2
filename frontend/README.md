# Frontend

The board's website: React + Vite + TypeScript, TanStack Query and Router, shadcn/ui on Tailwind. See
[CLAUDE.md](../CLAUDE.md) for the structure and rules, and [FRONTEND_REWRITE.md](../FRONTEND_REWRITE.md) /
[REWRITE_PROGRESS.md](../REWRITE_PROGRESS.md) for the rewrite from `frontend-legacy/`.

```bash
npm install
DEV_API_PROXY=http://localhost:8080 npm run dev   # http://localhost:5173, /api goes to the web server
npm run test -- --run                             # tests (Vitest + MSW)
npm run typecheck && npm run lint
npm run build                                     # dist/, served by nginx in the Docker image
```

Settings (`.env.local` or the environment, all optional):

| Variable                      | Default                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `VITE_API_URL`                | `/api/v1`                                                                    |
| `VITE_AUTORENDER_URL`         | `https://autorender.portal2.sr`                                              |
| `VITE_AUTORENDER_STORAGE_URL` | `https://portal2.fsn1.your-objectstorage.com`                                |
| `VITE_MEL_GAME_ID`            | `2`                                                                          |
| `VITE_USE_MOCK`               | `false` (`true` serves sample data from the MSW handlers instead of the API) |
| `VITE_VIEWER`                 | set by `vite.config.ts`: `true` when the demo viewer is in `public/viewer`   |

## Demo viewer

Where the demo viewer (a replay of a run's demo in the browser, from the private PortalRex/demo-viewer repo) is
built into `public/viewer/`, the site serves it at `/viewer/` and plays runs in its own pages: a **Replay** page
(`/replay`, the viewer under the site's header, linked next to each run's demo), a Video / Replay switch in a run's
details, and Race Top 5 / Race WR History / Swarm Top 100 / Pick Runs to Race on a map's page. The viewer reads
the boards and demos from this site's API. Build it from the viewer's checkout:

```bash
node tools/build-boards.mjs <path to this repo>   # writes frontend/public/viewer (git-ignored)
```

For local testing, `DEV_GAME_PROXY` (e.g. `http://localhost:5174`, the viewer's own dev server) passes `/game/`
(the hosted game files' build) and `/__game/` (the local Portal 2 install) to it for the replays' 3D view.

### Game files

The 3D view reads the game's files (maps, models, materials, particles, the in-world screens' videos) from `/game/v1/`:
the campaign and Challenge Mode maps and what they use, textures cut to 512 px, each file stored gzipped
under its content hash (~1.3 GB). Build the folder from the viewer's checkout with a Portal 2 install:

```bash
node --experimental-strip-types tools/assetplan.ts   # build/assetplan.json: what the maps use
node --experimental-strip-types tools/build-assets.ts   # writes build/gameassets/v1
```

nginx serves it from the `web` service's `game-assets` volume (`/usr/share/nginx/game`, read-only there; see
`docker-compose.coolify.yaml`). Copy the `v1` folder in once, and again after a rebuild, through a throwaway
container (on the Coolify server, `docker volume ls` lists the volume as `<id>_game-assets`):

```bash
tar -C build/gameassets -cf v1.tar v1   # on the build machine; scp v1.tar to the server
docker run --rm -i -v <id>_game-assets:/game alpine tar -C /game -xf - < v1.tar
```

Without the files, `/game/` is a 404 and the 3D view has nothing to draw. Locally, `DEV_GAME_PROXY` passes `/game/` to the viewer's dev server, which serves its build folder.

Without the viewer, none of this shows and `/viewer/` is a 404. nginx gives `/viewer/` its own security headers
(`viewer-security-headers.conf`: it may be framed by the site only).
