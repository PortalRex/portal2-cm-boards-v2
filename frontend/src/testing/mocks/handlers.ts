import { http, HttpResponse, type RequestHandler } from 'msw'
import catalog from '@/testing/fixtures/catalog.json'

/** Where the API is in tests (jsdom's origin + VITE_API_URL). */
export const API = 'http://localhost:3000/api/v1'

/** Autorender (VITE_AUTORENDER_URL's default). */
export const AUTORENDER = 'https://autorender.portal2.sr'

// Default handlers shared by the tests and the sample-data browser worker. Tests add their own
// with server.use(...).
export const handlers: RequestHandler[] = [
  http.get(`${API}/catalog`, () => HttpResponse.json(catalog)),
  http.get(`${API}/site`, () => HttpResponse.json({ private: false })),
  http.get(`${API}/auth/me`, () => HttpResponse.json(null)),
  // Map list previews: none unless a test says otherwise.
  http.get(`${API}/sp`, () => HttpResponse.json([])),
  http.get(`${API}/coop`, () => HttpResponse.json([])),
  // The home page's panels: empty unless a test says otherwise.
  http.get(`${API}/graph`, () => HttpResponse.json([])),
  http.get(`${API}/recap/weekly`, () =>
    HttpResponse.json({ start: '2026-10-12', end: '2026-10-19', runs: [] }),
  ),
  http.get(`${API}/daily`, () => HttpResponse.json({ date: '2026-10-17', chambers: [] })),
  // Aggregated boards: nobody unless a test says otherwise.
  http.get(`${API}/points/game/:game/:board`, () => HttpResponse.json({ id: null, points: [] })),
  // Countries: none unless a test says otherwise.
  http.get(`${API}/countries/stats`, () => HttpResponse.json([])),
  // Nobody banned unless a test says otherwise.
  http.get(`${API}/wall_of_shame`, () => HttpResponse.json([])),
  // A run's reaction counts: none unless a test says otherwise.
  http.get(`${API}/runs/:id/reactions`, () => HttpResponse.json({ up: 0, down: 0, mine: null })),
  // Nobody has donated unless a test says otherwise.
  http.get(`${API}/donators`, () => HttpResponse.json([])),
  // Staff panel: an empty log and no open reports unless a test says otherwise.
  http.get(`${API}/admin/audit`, () => HttpResponse.json([])),
  http.get(`${API}/admin/reports/count`, () => HttpResponse.json({ open: 0 })),
  // Staff: no notes on a run and nobody reacted, unless a test says otherwise.
  http.get(`${API}/admin/runs/:id/notes`, () => HttpResponse.json([])),
  http.get(`${API}/admin/runs/:id/reactions`, () => HttpResponse.json({ current: [], history: [] })),
  // No rendered videos unless a test says otherwise.
  http.post(`${AUTORENDER}/api/v1/check-videos-exist`, () => HttpResponse.json({ ids: [] })),
]
