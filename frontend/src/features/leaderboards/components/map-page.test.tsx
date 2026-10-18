import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import changelog from '@/testing/fixtures/changelog.json'
import coopBoard from '@/testing/fixtures/map-coop-board.json'
import spBoard from '@/testing/fixtures/map-sp-board.json'
import { users } from '@/testing/data/users'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderRoute } from '@/testing/test-utils'
import type { ChangelogRaw } from '@/types/runs'

// Laser Relays (47759) has the single player board fixture, Doors (47741) the co-op one.
function serveMap({ wrs = [] as ChangelogRaw[], history = [] as ChangelogRaw[] } = {}) {
  const boardAt: (string | null)[] = []
  const changelogAsked: URLSearchParams[] = []
  server.use(
    http.get(`${API}/map/sp/:id`, ({ request }) => {
      boardAt.push(new URL(request.url).searchParams.get('at'))
      return HttpResponse.json(spBoard)
    }),
    http.get(`${API}/map/coop/:id`, () => HttpResponse.json(coopBoard)),
    http.get(`${API}/changelog`, ({ request }) => {
      const params = new URL(request.url).searchParams
      changelogAsked.push(params)
      return HttpResponse.json(params.get('wr_gain') ? wrs : history)
    }),
    http.get(`${API}/changelog/:id/segments`, () => HttpResponse.json([])),
  )
  return { boardAt, changelogAsked }
}

const board = () => screen.getByRole('table', { name: 'Leaderboard' })

describe('Map page', () => {
  it('shows the map, its chapter and the board with ranks, players and times', async () => {
    serveMap()
    await renderRoute('/map/sp/47759')
    expect(await screen.findByRole('heading', { name: 'Laser Relays', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('The Return', { selector: 'p' })).toBeInTheDocument()
    const first = spBoard[0]!.map_data
    expect(await within(board()).findByRole('link', { name: first.user_name! })).toHaveAttribute(
      'href',
      `/profile/${first.profile_number}`,
    )
    expect(within(board()).getAllByRole('row')).toHaveLength(spBoard.length + 1)
    expect(screen.getByRole('link', { name: /P2SR Wiki Article/ })).toHaveAttribute(
      'href',
      'https://wiki.portal2.sr/Laser_Relays',
    )
  })

  it('shows co-op boards with blue and orange columns and an empty cell for a missing partner', async () => {
    serveMap()
    await renderRoute('/map/coop/47741')
    expect(await within(board()).findByRole('columnheader', { name: 'Blue' })).toBeInTheDocument()
    expect(within(board()).getByRole('columnheader', { name: 'Orange' })).toBeInTheDocument()
    // The filler partner of an unpaired run is the "Unknown partner" (no link).
    expect(await within(board()).findByText('Unknown partner')).toBeInTheDocument()
  })

  it('searches the board by player name', async () => {
    serveMap()
    await renderRoute('/map/sp/47759')
    const first = spBoard[0]!.map_data.user_name!
    const second = spBoard[1]!.map_data.user_name!
    await within(board()).findByRole('link', { name: first })
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search players' }), second)
    await waitFor(() => expect(within(board()).queryByRole('link', { name: first })).toBeNull())
    expect(within(board()).getByRole('link', { name: second })).toBeInTheDocument()
  })

  it("pins the signed-in player's best and opens it on the board", async () => {
    serveMap()
    const mine = spBoard[2]!.map_data
    await renderRoute('/map/sp/47759', { user: { ...users.player, profile_number: mine.profile_number } })
    await userEvent.click(await screen.findByRole('button', { name: /your best/i }))
    expect(await within(board()).findByText('SAR Version:')).toBeInTheDocument()
  })

  it("falls back to the player's recorded PB when they're off the board", async () => {
    serveMap()
    server.use(
      http.get(`${API}/profile/scores/:id`, () =>
        HttpResponse.json([
          { map_id: '47759', score: 2500, rank: 300, timestamp: '2026-01-02T00:00:00', changelog_id: 1 },
        ]),
      ),
    )
    await renderRoute('/map/sp/47759', { user: 'player' })
    expect(await screen.findByText(`outside the top ${spBoard.length}`)).toBeInTheDocument()
    expect(screen.getByText('25.00')).toBeInTheDocument()
  })

  it('says when the player has no time on the map', async () => {
    serveMap()
    server.use(http.get(`${API}/profile/scores/:id`, () => HttpResponse.json([])))
    await renderRoute('/map/sp/47759', { user: 'player' })
    expect(await screen.findByText('You don’t have a time on this map yet.')).toBeInTheDocument()
  })

  it('shows the board as it stood at ?at=, with a way back', async () => {
    const { boardAt } = serveMap()
    const { router } = await renderRoute('/map/sp/47759?at=2020-05-01T12:00:00')
    expect(await screen.findByText(/Leaderboard as it stood on/)).toBeInTheDocument()
    await waitFor(() => expect(boardAt).toContain('2020-05-01T12:00:00'))
    await userEvent.click(screen.getByRole('button', { name: 'Back to the current board' }))
    await waitFor(() => expect(router.state.location.search).toEqual({}))
  })

  it('counts the world records on the chart, leaving out banned ones', async () => {
    const wrs = (changelog as ChangelogRaw[]).slice(0, 3).map((r, i) => ({ ...r, banned: i === 2 }))
    serveMap({ wrs })
    await renderRoute('/map/sp/47759')
    expect(await screen.findByText('2 world records')).toBeInTheDocument()
  })

  it('switches to the chamber history with its own filters', async () => {
    const { changelogAsked } = serveMap({ history: changelog as ChangelogRaw[] })
    await renderRoute('/map/sp/47759')
    await userEvent.click(await screen.findByRole('button', { name: /chamber history/i }))
    const table = await screen.findByRole('table', { name: 'Chamber history' })
    expect(within(table).getAllByRole('row')).toHaveLength(changelog.length + 1)
    expect(screen.getByText(`${changelog.length} runs`)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Has demo' }))
    await waitFor(() => expect(changelogAsked.at(-1)?.get('has_demo')).toBe('true'))
    expect(changelogAsked.at(-1)?.get('chamber')).toBe('47759')
    await userEvent.click(screen.getByRole('button', { name: /^leaderboard/i }))
    expect(await screen.findByRole('table', { name: 'Leaderboard' })).toBeInTheDocument()
  })

  it('opens Run Details under a board row', async () => {
    serveMap()
    await renderRoute('/map/sp/47759')
    await within(board()).findByRole('link', { name: spBoard[0]!.map_data.user_name! })
    const rows = within(board()).getAllByRole('row')
    await userEvent.click(within(rows[1]!).getAllByRole('cell')[0]!)
    expect(await within(board()).findByText('SAR Version:')).toBeInTheDocument()
    expect(rows[1]).toHaveAttribute('aria-expanded', 'true')
  })

  describe('redirects', () => {
    it('sends unknown maps to the map list', async () => {
      serveMap()
      const { router } = await renderRoute('/map/sp/nope')
      await waitFor(() => expect(router.state.location.pathname).toBe('/maps'))
    })

    it('fixes the mode in the address', async () => {
      serveMap()
      const { router } = await renderRoute('/map/coop/47759?at=2020-01-01T00:00:00')
      await waitFor(() => expect(router.state.location.pathname).toBe('/map/sp/47759'))
      // The query is kept (written URL-encoded, as legacy's URLSearchParams did too).
      expect(router.state.location.search).toEqual({ at: '2020-01-01T00:00:00' })
    })

    it("opens a season's copy as its base map with the season picked", async () => {
      serveMap()
      const { router } = await renderRoute('/map/portal-2-season-1-coop/s4-47741')
      await waitFor(() => expect(router.state.location.href).toBe('/map/coop/47741?season=portal-2-season-1'))
    })
  })

  describe('WR history editor', () => {
    const editButton = () => screen.queryByRole('button', { name: /edit wr history/i })

    it.each([null, 'player'] as const)('is hidden from %s', async (user) => {
      serveMap()
      await renderRoute('/map/sp/47759', { user })
      await screen.findByRole('heading', { name: 'Laser Relays', level: 1 })
      expect(editButton()).toBeNull()
    })

    it('is hidden from staff viewing the site as a player', async () => {
      serveMap()
      await renderRoute('/map/sp/47759', { user: 'admin', viewAsPlayer: true })
      await screen.findByRole('heading', { name: 'Laser Relays', level: 1 })
      expect(editButton()).toBeNull()
    })

    it.each(['verifier', 'moderator', 'admin'] as const)(
      'lets a %s remove a record from the history with a reason',
      async (user) => {
        const wr = { ...(changelog as ChangelogRaw[])[0]!, wr_hidden: false }
        serveMap({ wrs: [wr] })
        const bodies: unknown[] = []
        server.use(
          http.put(`${API}/admin/runs/${wr.id}/wr_history`, async ({ request }) => {
            bodies.push(await request.json())
            return new HttpResponse(null, { status: 200 })
          }),
        )
        await renderRoute('/map/sp/47759', { user })
        await userEvent.click(await screen.findByRole('button', { name: /edit wr history/i }))
        const table = await screen.findByRole('table', { name: 'World record history' })
        await userEvent.type(screen.getByRole('textbox', { name: 'Reason' }), 'spliced demo')
        await userEvent.click(within(table).getByRole('button', { name: 'Remove' }))
        await waitFor(() => expect(bodies).toEqual([{ hidden: true, reason: 'spliced demo' }]))
      },
    )
  })
})
