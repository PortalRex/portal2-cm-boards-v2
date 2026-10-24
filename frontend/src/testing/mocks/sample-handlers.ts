import { http, HttpResponse, type RequestHandler } from 'msw'
import {
  SAMPLE_ME,
  SAMPLE_PLAYERS,
  sampleActivity,
  sampleChangelog,
  sampleCoopBoard,
  sampleDaily,
  sampleGameRanks,
  samplePoints,
  samplePointsHistory,
  sampleProfilePage,
  sampleProfileScores,
  sampleUser,
  sampleWeeklyRecap,
  samplePreviews,
  sampleSpBoard,
  sampleWallOfShame,
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
    // Like legacy's sample donators: the first five players, $50 down to $10.
    http.get(`${api}/donators`, () =>
      HttpResponse.json(
        SAMPLE_PLAYERS.slice(0, 5).map((p, i) => ({
          profile_number: p.profileNumber,
          board_name: p.name,
          steam_name: p.name,
          avatar: p.avatar,
          donation_amount: String(50 - i * 10),
        })),
      ),
    ),
    // A small sample team: two admins and two verifiers.
    http.get(`${api}/staff`, () =>
      HttpResponse.json(
        SAMPLE_PLAYERS.slice(0, 4).map((p, i) => ({
          profile_number: p.profileNumber,
          user_name: p.name,
          avatar: p.avatar,
          role: i < 2 ? 'admin' : 'verifier',
        })),
      ),
    ),
    http.get(`${api}/graph`, () => HttpResponse.json(sampleActivity())),
    http.get(`${api}/recap/weekly`, ({ request }) => {
      const url = new URL(request.url)
      return HttpResponse.json(sampleWeeklyRecap(gameOf(url), url.searchParams.get('week') ?? undefined))
    }),
    http.get(`${api}/daily`, ({ request }) => {
      const url = new URL(request.url)
      return HttpResponse.json(sampleDaily(gameOf(url), url.searchParams.get('date') ?? undefined))
    }),
    http.get(`${api}/points/game/:game/:board`, ({ params }) =>
      HttpResponse.json(samplePoints(String(params.game) === '2' ? 'mel' : 'portal2', String(params.board))),
    ),
    // Profiles: no peak or past days in sample data (legacy's sample profile had neither).
    http.get(`${api}/profile/points_peak/:id`, () => HttpResponse.json({})),
    http.get(`${api}/profile/aggregated/:id`, () => HttpResponse.json([])),
    http.get(`${api}/profile/points_history/:id`, ({ params }) =>
      HttpResponse.json(samplePointsHistory(String(params.id))),
    ),
    http.get(`${api}/profile/scores/:id`, ({ params }) =>
      HttpResponse.json(sampleProfileScores(String(params.id))),
    ),
    http.get(`${api}/profile/:id`, ({ params }) => HttpResponse.json(sampleProfilePage(String(params.id)))),
    http.get(`${api}/user/:id`, ({ params }) => HttpResponse.json(sampleUser(String(params.id)))),
    http.get(`${api}/ranks/game/:game/:id`, ({ params }) =>
      HttpResponse.json(String(params.game) === '2' ? sampleGameRanks('mel', String(params.id)) : {}),
    ),
    http.get(`${api}/wall_of_shame`, () => HttpResponse.json(sampleWallOfShame())),
    http.all(`${api}/*`, () =>
      HttpResponse.json({ error: "Sample data doesn't cover this yet." }, { status: 404 }),
    ),
  ]
}
