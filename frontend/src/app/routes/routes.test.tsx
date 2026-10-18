import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { API } from '@/testing/mocks/handlers'
import { FIXTURE_PLAYER, serveProfile } from '@/testing/mocks/profile'
import { serveStats } from '@/testing/mocks/stats'
import { server } from '@/testing/mocks/server'
import { renderRoute } from '@/testing/test-utils'

// Every legacy URL (frontend-legacy/src/App.js) must keep working. Pages not built yet render a
// placeholder with their title; the tests check each address reaches its route.
const pages: [string, string][] = [
  ['/maps', 'Leaderboards'],
  ['/map/sp/47458', 'Portal Gun'],
  ['/map/coop/47741?season=portal-2-season-1', 'Doors'],
  ['/leaderboard/overall', 'Overall'],
  ['/leaderboard/overall?season=portal-2-season-1&country=hu', 'Overall'],
  ['/leaderboard/sp', 'Single Player'],
  ['/leaderboard/coop', 'Cooperative'],
  ['/leaderboard/mel/story', 'Story Mode'],
  ['/leaderboard/mel/advanced?season=x', 'Advanced Mode'],
  ['/leaderboard/chapter/7', 'The Courtesy Call'],
  ['/leaderboard/chapter/1?country=hu', 'Team Building'],
  ['/leaderboard/game/custom-game/overall', 'Overall'],
  ['/leaderboard/game/custom-game/custom-game-sp', 'Main Board'],
  ['/stats', 'Runners'],
  ['/stats?board=sp&game=mel', 'Runners'],
  ['/stats/records', 'World records'],
  ['/stats/records?mode=coop', 'World records'],
  ['/stats/history', 'Record history'],
  ['/stats/history?view=days', 'Record history'],
  ['/stats/race', 'World record race'],
  ['/stats/compare', 'Compare players'],
  ['/stats/compare?mode=coop', 'Compare players'],
  ['/stats/countries', 'Countries'],
  ['/more/settings', 'Settings'],
  ['/more/wall-of-shame', 'Wall Of Shame'],
  ['/more/donators', 'Donators'],
  ['/more/about', 'About'],
  ['/admin', 'Staff'],
]

describe('routes', () => {
  it('opens Score Updates at /', async () => {
    const { router } = await renderRoute('/')
    expect(router.state.location.pathname).toBe('/')
    expect(await screen.findByRole('heading', { name: 'Score Updates' })).toBeInTheDocument()
  })

  it('opens a profile at /profile/{steam id}', async () => {
    serveProfile()
    const { router } = await renderRoute(`/profile/${FIXTURE_PLAYER}?season=x`)
    expect(router.state.location.href).toBe(`/profile/${FIXTURE_PLAYER}?season=x`)
    expect(await screen.findByRole('heading', { name: /hero/, level: 1 })).toBeInTheDocument()
  })

  it.each(pages)('%s renders its page', async (url, title) => {
    serveStats()
    server.use(
      http.get(`${API}/map/:kind/:id`, () => HttpResponse.json([])),
      http.get(`${API}/changelog`, () => HttpResponse.json([])),
    )
    const { router } = await renderRoute(url)
    expect(router.state.location.href).toBe(url)
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
  })

  it.each([
    ['/leaderboard', '/leaderboard/overall'],
    ['/leaderboard/mel', '/leaderboard/mel/overall'],
    ['/stats/times', '/stats'],
    ['/stats/times?x=1', '/stats'],
    ['/compare', '/stats/compare'],
    [
      '/compare?a=76561198000000001&b=76561198000000002',
      '/stats/compare?a=76561198000000001&b=76561198000000002',
    ],
    ['/more/countries', '/stats/countries'],
    ['/more/countries?board=sp', '/stats/countries?board=sp'],
  ])('%s redirects to %s', async (from, to) => {
    const { router } = await renderRoute(from)
    expect(router.state.location.href).toBe(to)
  })

  // Aggregated addresses that only the catalog can resolve redirect from the page.
  it.each([
    ['/leaderboard/season', '/leaderboard/overall?season=portal-2-season-1'],
    ['/leaderboard/nope', '/leaderboard/overall'],
    ['/leaderboard/mel/sp', '/leaderboard/mel/overall'],
    ['/leaderboard/chapter/99', '/leaderboard/overall'],
    ['/leaderboard/game/custom-game', '/leaderboard/game/custom-game/overall'],
    ['/leaderboard/game/custom-game/nope', '/leaderboard/game/custom-game/overall'],
    ['/leaderboard/game/nope/overall', '/leaderboard/overall'],
    ['/leaderboard/game/mel/story', '/leaderboard/mel/overall'],
    ['/leaderboard/game/portal-2-season-1', '/leaderboard/overall?season=portal-2-season-1'],
    [
      '/leaderboard/game/portal-2-season-1/portal-2-season-1-coop?country=hu',
      '/leaderboard/coop?country=hu&season=portal-2-season-1',
    ],
  ])('%s opens %s', async (from, to) => {
    const { router } = await renderRoute(from)
    await waitFor(() => expect(router.state.location.href).toBe(to))
  })

  it('shows the placeholder for More pages without a design', async () => {
    await renderRoute('/more/discord')
    expect(await screen.findByRole('heading', { name: 'Discord' })).toBeInTheDocument()
    expect(screen.getByText('This page hasn’t been designed yet.')).toBeInTheDocument()
  })

  it('shows "Page not found" for unknown addresses', async () => {
    await renderRoute('/more/nope')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    await renderRoute('/no/such/page')
    expect((await screen.findAllByText('There’s nothing here.')).length).toBeGreaterThan(0)
  })
})
