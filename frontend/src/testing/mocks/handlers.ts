import { http, HttpResponse, type RequestHandler } from 'msw'
import catalog from '@/testing/fixtures/catalog.json'

/** Where the API is in tests (jsdom's origin + VITE_API_URL). */
export const API = 'http://localhost:3000/api/v1'

// Default handlers shared by the tests and the sample-data browser worker. Tests add their own
// with server.use(...).
export const handlers: RequestHandler[] = [http.get(`${API}/catalog`, () => HttpResponse.json(catalog))]
