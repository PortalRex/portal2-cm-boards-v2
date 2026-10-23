import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { formatDelta, formatScore } from '@/lib/format'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderRoute } from '@/testing/test-utils'

const A = '76561198000000011'
const B = '76561198000000022'
const SEASON = 'portal-2-season-1'
const names: Record<string, string> = { [A]: 'Alpha', [B]: 'Bravo' }
// Container Ride, Portal Carousel, Portal Gun (chapter 1) and Doors (co-op).
const best: Record<string, { map_id: string; score: number; rank: number }[]> = {
  [A]: [
    { map_id: '62761', score: 1000, rank: 2 },
    { map_id: '62758', score: 900, rank: 5 },
    { map_id: '47458', score: 500, rank: 3 },
  ],
  [B]: [
    { map_id: '62761', score: 1100, rank: 4 },
    { map_id: '62758', score: 800, rank: 1 },
    { map_id: '47741', score: 700, rank: 1 },
  ],
}

function servePlayers() {
  const asked: string[] = []
  server.use(
    http.get(`${API}/user/:id`, ({ params }) =>
      HttpResponse.json({ board_name: names[String(params.id)], steam_name: null, avatar: null }),
    ),
    http.get(`${API}/profile/scores/:id`, ({ params }) => HttpResponse.json(best[String(params.id)] ?? [])),
    http.get(`${API}/ranks/game/:game/:id`, ({ request }) => {
      asked.push(new URL(request.url).pathname)
      return HttpResponse.json({})
    }),
    http.get(`${API}/changelog`, () => HttpResponse.json([])),
    http.get(`${API}/users/search`, ({ request }) => {
      asked.push(new URL(request.url).search)
      return HttpResponse.json([{ profile_number: A, user_name: 'Alpha', avatar: null, runs: 42 }])
    }),
  )
  return asked
}

describe('Compare', () => {
  it('asks for two players', async () => {
    servePlayers()
    await renderRoute('/stats/compare')
    expect(await screen.findByText('Pick two players to compare their times.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'First player' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Second player' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Swap players' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Compare' })).toHaveAttribute('aria-current', 'page')
  })

  it('finds players by name once typing stops and puts the pick in the address', async () => {
    const asked = servePlayers()
    const { router } = await renderRoute('/stats/compare')
    await userEvent.type(screen.getByRole('textbox', { name: 'First player' }), 'al')
    const results = await screen.findByRole('list', { name: 'First player results' })
    const alpha = await within(results).findByRole('button', { name: /Alpha.*42 runs/ })
    expect(asked).toEqual(['?q=al'])
    await userEvent.click(alpha)
    await waitFor(() => expect(router.state.location.search).toEqual({ a: A }))
    expect(await screen.findByRole('link', { name: 'Alpha' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument()
  })

  it("doesn't search for a single character", async () => {
    const asked = servePlayers()
    await renderRoute('/stats/compare')
    await userEvent.type(screen.getByRole('textbox', { name: 'First player' }), 'a')
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.queryByRole('list', { name: 'First player results' })).not.toBeInTheDocument()
    expect(asked).toEqual([])
  })

  it('compares the two map by map, with who is faster on how many', async () => {
    servePlayers()
    await renderRoute(`/stats/compare?a=${A}&b=${B}`)
    const summary = await screen.findByLabelText('Summary')
    // Alpha: Container Ride and Portal Gun (only Alpha has a time); Bravo: Portal Carousel.
    const [alpha, bravo] = within(summary).getAllByText(/^\d+$/, { selector: 'strong' })
    expect(alpha).toHaveTextContent('2')
    expect(bravo).toHaveTextContent('1')
    expect(within(summary).getByText('0 tied')).toBeInTheDocument()
    expect(within(summary).getByText(/over 2 shared maps/)).toBeInTheDocument()
    expect(
      within(summary).getByText('Including maps only one has a time on: Alpha 1 · Bravo 0'),
    ).toBeInTheDocument()
    const ride = screen.getByRole('row', { name: 'Container Ride' })
    expect(within(ride).getByText(formatScore(1000)).closest('[data-win]')).not.toBeNull()
    // The gap between the two.
    expect(within(ride).getByText(formatDelta(100))).toBeInTheDocument()
  })

  it('swaps the players', async () => {
    servePlayers()
    const { router } = await renderRoute(`/stats/compare?a=${A}&b=${B}`)
    await screen.findByLabelText('Summary')
    await userEvent.click(screen.getByRole('button', { name: 'Swap players' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ a: B, b: A }))
  })

  it('switches to co-op', async () => {
    servePlayers()
    const { router } = await renderRoute(`/stats/compare?a=${A}&b=${B}`)
    await screen.findByLabelText('Summary')
    await userEvent.click(screen.getByRole('radio', { name: 'Cooperative' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ a: A, b: B, mode: 'coop' }))
    expect(await screen.findByRole('row', { name: 'Doors' })).toBeInTheDocument()
  })

  it("compares a season's results, also from an old ?game=<season> link", async () => {
    const asked = servePlayers()
    await renderRoute(`/stats/compare?a=${A}&b=${B}&game=${SEASON}`)
    await screen.findByLabelText('Summary')
    expect(screen.getByRole('combobox', { name: 'Season' })).toHaveValue(SEASON)
    expect(asked).toContain(`/api/v1/ranks/game/4/${A}`)
  })
})
