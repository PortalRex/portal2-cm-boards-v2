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
  // No rendered videos unless a test says otherwise.
  http.post(`${AUTORENDER}/api/v1/check-videos-exist`, () => HttpResponse.json({ ids: [] })),
]
