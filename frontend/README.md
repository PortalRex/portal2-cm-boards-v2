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
built into `public/viewer/`, the site serves it at `/viewer/` and shows a **Watch in the browser** link next to each
run's demo. It reads the boards and demos from this site's API. Build it from the viewer's checkout:

```bash
node tools/build-boards.mjs <path to this repo>   # writes frontend/public/viewer (git-ignored)
```

Without it, nothing links to it and `/viewer/` is a 404. nginx gives `/viewer/` its own security headers
(`viewer-security-headers.conf`).
