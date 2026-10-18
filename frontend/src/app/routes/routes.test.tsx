import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderRoute } from '@/testing/test-utils'

// Every legacy URL (frontend-legacy/src/App.js) must keep working. Pages not built yet render a
// placeholder with their title; the tests check each address reaches its route.
const pages: [string, string][] = [
  ['/maps', 'Leaderboard'],
  ['/map/sp/47458', 'Map'],
  ['/map/coop/47741?season=portal-2-season-1', 'Map'],
  ['/leaderboard/overall', 'Aggregated'],
  ['/leaderboard/sp', 'Aggregated'],
  ['/leaderboard/coop', 'Aggregated'],
  ['/leaderboard/mel/story', 'Aggregated'],
  ['/leaderboard/chapter/7', 'Aggregated'],
  ['/leaderboard/game/custom-game', 'Aggregated'],
  ['/leaderboard/game/custom-game/custom-game-sp', 'Aggregated'],
  ['/profile/76561198000000001', 'Profile'],
  ['/stats', 'Stats'],
  ['/stats/records', 'Stats'],
  ['/stats/history', 'Stats'],
  ['/stats/race', 'Stats'],
  ['/stats/compare?a=1&b=2', 'Compare'],
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

  it.each(pages)('%s renders its page', async (url, title) => {
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
