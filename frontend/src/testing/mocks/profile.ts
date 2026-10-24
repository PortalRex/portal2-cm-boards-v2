import { http, HttpResponse } from 'msw'
import changelog from '@/testing/fixtures/profile-changelog.json'
import past from '@/testing/fixtures/profile-at.json'
import page from '@/testing/fixtures/profile-page.json'
import peak from '@/testing/fixtures/profile-peak.json'
import pointsHistory from '@/testing/fixtures/profile-points-history.json'
import scores from '@/testing/fixtures/profile-scores.json'
import stats from '@/testing/fixtures/profile-stats.json'
import user from '@/testing/fixtures/profile-user.json'
import { API } from './handlers'
import { server } from './server'

/** The player in the profile fixtures (captured from the local API). */
export const FIXTURE_PLAYER = '76561198254956991'

export interface ProfileRequests {
  /** Every request's path and query, in order ("/ranks/game/2/7656...", "/changelog?..."). */
  asked: string[]
}

/**
 * Serves the profile fixtures for FIXTURE_PLAYER (Portal 2), and `gameRanks` / `gameRuns` for
 * /ranks/game/{id} and other games' changelogs. Records what was asked for.
 */
export function serveProfile({
  gameRanks = {},
  gameRuns = [],
  user: userOverride = {},
  aggregated = [],
}: {
  gameRanks?: Record<string, Record<string, number>>
  gameRuns?: unknown[]
  user?: Record<string, unknown>
  /** GET /profile/aggregated's boards (none by default). */
  aggregated?: unknown[]
} = {}): ProfileRequests {
  const requests: ProfileRequests = { asked: [] }
  const note = (request: Request) => {
    const url = new URL(request.url)
    requests.asked.push(url.pathname.replace('/api/v1', '') + url.search)
  }
  server.use(
    http.get(`${API}/profile/points_peak/:id`, ({ request }) => (note(request), HttpResponse.json(peak))),
    http.get(`${API}/profile/aggregated/:id`, ({ request }) => (note(request), HttpResponse.json(aggregated))),
    http.get(
      `${API}/profile/points_history/:id`,
      ({ request }) => (note(request), HttpResponse.json(pointsHistory)),
    ),
    http.get(`${API}/profile/stats/:id`, ({ request }) => (note(request), HttpResponse.json(stats))),
    http.get(`${API}/profile/scores/:id`, ({ request }) => (note(request), HttpResponse.json(scores))),
    http.get(`${API}/profile/at/:id`, ({ request }) => (note(request), HttpResponse.json(past))),
    http.get(`${API}/profile/:id`, ({ request, params }) => {
      note(request)
      return params.id === FIXTURE_PLAYER
        ? HttpResponse.json(page)
        : HttpResponse.json({ error: 'No such user.' }, { status: 404 })
    }),
    http.get(
      `${API}/user/:id`,
      ({ request }) => (note(request), HttpResponse.json({ ...user, ...userOverride })),
    ),
    http.get(`${API}/ranks/game/:game/:id`, ({ request, params }) => {
      note(request)
      return HttpResponse.json(gameRanks[String(params.game)] ?? {})
    }),
    http.get(`${API}/changelog`, ({ request }) => {
      note(request)
      const game = new URL(request.url).searchParams.get('game_id')
      return HttpResponse.json(game ? gameRuns : changelog)
    }),
  )
  return requests
}
