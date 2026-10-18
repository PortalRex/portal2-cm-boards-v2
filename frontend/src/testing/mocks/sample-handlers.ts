import { http, HttpResponse, type RequestHandler } from 'msw'
import {
  SAMPLE_ME,
  sampleActivity,
  sampleChangelog,
  sampleCoopBoard,
  samplePreviews,
  sampleSpBoard,
} from '@/testing/data/sample'

// The API as sample data (VITE_USE_MOCK=true): the browser worker serves these, and tests can use
// them for whole-page renders. Like the legacy sample mode, the catalog is the built-in Portal 2 /
// Mel one and a sample player is signed in. Endpoints without sample data answer 404, so pages
// show their normal error state for them.

const gameOf = (url: URL) => (url.searchParams.get('game_id') === '2' ? 'mel' : 'portal2')
const query = (url: URL) => Object.fromEntries(url.searchParams)

export function sampleHandlers(api: string): RequestHandler[] {
  return [
    http.get(`${api}/catalog`, () => HttpResponse.json([])),
    http.get(`${api}/site`, () => HttpResponse.json({ private: false })),
    http.get(`${api}/auth/me`, () => HttpResponse.json(SAMPLE_ME)),
    http.post(`${api}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
    http.get(`${api}/changelog`, ({ request }) => {
      const url = new URL(request.url)
      return HttpResponse.json(sampleChangelog({ ...query(url), game: gameOf(url) }))
    }),
    http.get(`${api}/map/sp/:id`, ({ request, params }) =>
      HttpResponse.json(sampleSpBoard(String(params.id), gameOf(new URL(request.url)))),
    ),
    http.get(`${api}/map/coop/:id`, ({ params }) => HttpResponse.json(sampleCoopBoard(String(params.id)))),
    http.get(`${api}/sp`, ({ request }) =>
      HttpResponse.json(samplePreviews(gameOf(new URL(request.url)), false)),
    ),
    http.get(`${api}/coop`, ({ request }) =>
      HttpResponse.json(samplePreviews(gameOf(new URL(request.url)), true)),
    ),
    http.get(`${api}/graph`, () => HttpResponse.json(sampleActivity())),
    http.all(`${api}/*`, () =>
      HttpResponse.json({ error: "Sample data doesn't cover this yet." }, { status: 404 }),
    ),
  ]
}
