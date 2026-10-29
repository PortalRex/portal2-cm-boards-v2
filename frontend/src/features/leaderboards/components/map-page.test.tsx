import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import changelog from '@/testing/fixtures/changelog.json'
import coopBoard from '@/testing/fixtures/map-coop-board.json'
import spBoard from '@/testing/fixtures/map-sp-board.json'
import { users } from '@/testing/data/users'
import { env } from '@/config/env'
import { replaySearchSchema } from '@/lib/runs/viewer'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderRoute } from '@/testing/test-utils'
import type { ChangelogRaw, OldWrRaw } from '@/types/runs'

// Laser Relays (47759) has the single player board fixture, Doors (47741) the co-op one.

/** World records on the map: the fixture's runs as records set a year apart, each faster. */
const records = (times: number[]): ChangelogRaw[] =>
  times.map((score, i) => ({
    ...(changelog as ChangelogRaw[])[i]!,
    score,
    timestamp: `${2020 + i}-01-01T00:00:00`,
  }))
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

  it('marks each co-op player whose PB the run is, as Score Updates does', async () => {
    serveMap()
    await renderRoute('/map/coop/47741')
    // RealCreative is on the record (733) and again on the slower 736, where unity set their PB.
    const notPb = await within(board()).findAllByTitle("Not RealCreative's PB")
    expect(notPb).toHaveLength(1)
    const pb = within(board()).getByTitle('unity set a PB')
    expect(within(pb).getByRole('img', { name: 'PB' })).toBeInTheDocument()
    // Both players on the record set their PB there.
    expect(within(board()).getByTitle('RealCreative set a PB')).toBeInTheDocument()
    expect(within(board()).getByTitle('Suola set a PB')).toBeInTheDocument()
    // Everyone but the repeated RealCreative and the unknown partner: 6 of the 8 players.
    expect(within(board()).getAllByRole('img', { name: 'PB' })).toHaveLength(6)
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
    const wrs = records([2400, 2300, 2200]).map((r, i) => ({ ...r, banned: i === 2 }))
    serveMap({ wrs })
    await renderRoute('/map/sp/47759')
    expect(await screen.findByText('2 world records')).toBeInTheDocument()
  })

  it("counts a co-op run's two players' entries as one record", async () => {
    const [a, b] = records([2400, 2400])
    serveMap({
      wrs: [
        { ...a!, coop_id: 7 },
        { ...b!, coop_id: 7, timestamp: a!.timestamp },
      ],
    })
    await renderRoute('/map/coop/47741')
    expect(await screen.findByText('1 world record')).toBeInTheDocument()
  })

  it('adds records from before the boards to the chart, counting only those that were the best yet', async () => {
    // The board's records: 24.00 in 2020, 21.00 in 2021.
    serveMap({ wrs: records([2400, 2100]) })
    const old = (score: number, set_at: string): OldWrRaw => ({
      id: score,
      map_id: '47759',
      score,
      set_at,
      time_known: false,
      date_estimated: false,
      player_name: 'Kingpin',
      profile_number: null,
      note: null,
      source: 'test',
    })
    const asked: string[] = []
    server.use(
      http.get(`${API}/map/:id/old_wrs`, ({ params }) => {
        asked.push(String(params.id))
        // 25.00 and 23.00 in 2011: the board's 24.00 wasn't faster than 23.00, its 21.00 was.
        return HttpResponse.json([old(2500, '2011-10-08T12:00:00'), old(2300, '2011-11-01T12:00:00')])
      }),
    )
    await renderRoute('/map/sp/47759')
    expect(await screen.findByText('3 world records')).toBeInTheDocument()
    expect(asked).toEqual(['47759'])
  })

  it('steps through the records with the arrow keys, moving the board to each, then back to today', async () => {
    // Records on 2020-01-01 and 2021-01-01.
    serveMap({ wrs: records([2400, 2100]) })
    const { router } = await renderRoute('/map/sp/47759')
    await screen.findByText('2 world records')
    const chart = screen.getByRole('generic', { name: /World record history/ })
    chart.focus()
    const at = () => (router.state.location.search as { at?: string }).at
    await userEvent.keyboard('{ArrowLeft}')
    await waitFor(() => expect(at()).toBe('2021-01-01T00:00:00'))
    await userEvent.keyboard('{ArrowLeft}')
    await waitFor(() => expect(at()).toBe('2020-01-01T00:00:00'))
    // Nothing before the first.
    await userEvent.keyboard('{ArrowLeft}')
    expect(at()).toBe('2020-01-01T00:00:00')
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    await waitFor(() => expect(at()).toBeUndefined())
  })

  it('moves a zoomed chart along when the arrow keys step off it', async () => {
    // Records on 2020-01-01 and 2021-01-01.
    serveMap({ wrs: records([2400, 2100]) })
    const { router } = await renderRoute('/map/sp/47759')
    await screen.findByText('2 world records')
    const chart = screen.getByRole('generic', { name: /World record history/ })
    const view = screen.getByTestId('history-minimap-window')
    // Zoomed in on the start of the history (jsdom has no layout: the wheel zooms at the left).
    for (let i = 0; i < 12; i++) fireEvent.wheel(chart, { deltaY: -100 })
    await waitFor(() => expect(view.style.left).toBe('0%'))
    const width = view.style.width
    expect(parseFloat(width)).toBeLessThan(15)
    chart.focus()
    // From today back to the 2021 record, which is off the view: the view goes there, as wide as before.
    await userEvent.keyboard('{ArrowLeft}')
    await waitFor(() =>
      expect((router.state.location.search as { at?: string }).at).toBe('2021-01-01T00:00:00'),
    )
    await waitFor(() => expect(parseFloat(view.style.left)).toBeGreaterThan(0))
    expect(parseFloat(view.style.width)).toBeCloseTo(parseFloat(width))
  })

  it('steps through the records with the Earlier and Later buttons (touch screens show them)', async () => {
    // Records on 2020-01-01 and 2021-01-01.
    serveMap({ wrs: records([2400, 2100]) })
    const { router } = await renderRoute('/map/sp/47759')
    await screen.findByText('2 world records')
    const at = () => (router.state.location.search as { at?: string }).at
    const press = (name: string) => userEvent.click(screen.getByRole('button', { name }))
    await press('Earlier')
    await waitFor(() => expect(at()).toBe('2021-01-01T00:00:00'))
    await press('Earlier')
    await waitFor(() => expect(at()).toBe('2020-01-01T00:00:00'))
    await press('Later')
    await waitFor(() => expect(at()).toBe('2021-01-01T00:00:00'))
    // Past the latest record: today's board.
    await press('Later')
    await waitFor(() => expect(at()).toBeUndefined())
  })

  it('zooms the chart with two fingers, keeping the moment between them under them', async () => {
    serveMap({ wrs: records([2400, 2100]) })
    const { router } = await renderRoute('/map/sp/47759')
    await screen.findByText('2 world records')
    // The chart is 1068px wide: its 56px time axis, 1000px of plot and 12px to the right.
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 1068, height: 200 }))
    try {
      const chart = screen.getByRole('generic', { name: /World record history/ })
      const view = screen.getByTestId('history-minimap-window')
      // A touch event on `on`, with every finger on the screen as [x, the element it's on].
      const touch = (
        type: 'touchStart' | 'touchMove' | 'touchEnd',
        fingers: [number, Element][],
        on: Element = chart,
      ) =>
        fireEvent[type](on, {
          touches: fingers.map(([x, target]) => ({ clientX: x, clientY: 0, target })),
        })

      // Fingers 400px and 600px across (around the middle), then the second goes out to the end:
      // three times as far apart, so a third as wide, with the middle now 700px across.
      touch('touchStart', [[456, chart]])
      touch('touchStart', [
        [456, chart],
        [656, chart],
      ])
      touch('touchMove', [
        [456, chart],
        [1056, chart],
      ])
      await waitFor(() => expect(parseFloat(view.style.width)).toBeCloseTo(100 / 3))
      expect(parseFloat(view.style.left)).toBeCloseTo(50 - 70 / 3)
      // Both fingers lift at once (one "lifted" event, as a phone may send): nothing is left over.
      touch('touchEnd', [])
      // Lifting the fingers picks nothing.
      fireEvent.click(chart, { clientX: 456 })
      expect((router.state.location.search as { at?: string }).at).toBeUndefined()

      // Pinching back out, the second finger landing off the chart (it starts wide apart): all of
      // the history again.
      touch('touchStart', [[556, chart]])
      touch(
        'touchStart',
        [
          [556, chart],
          [1056, document.body],
        ],
        document.body,
      )
      touch(
        'touchMove',
        [
          [556, chart],
          [600, document.body],
        ],
        document.body,
      )
      await waitFor(() => expect(view.style.width).toBe('100%'))
      touch('touchEnd', [])
    } finally {
      rect.mockRestore()
    }
  })

  it('opens a bigger chart, whose arrow keys move the board too without closing it', async () => {
    serveMap({ wrs: records([2400, 2100]) })
    const { router } = await renderRoute('/map/sp/47759')
    await screen.findByText('2 world records')
    await userEvent.click(screen.getByRole('button', { name: 'Expand the WR history' }))
    const dialog = await screen.findByRole('dialog', { name: 'World record history' })
    within(dialog)
      .getByRole('generic', { name: /World record history/ })
      .focus()
    await userEvent.keyboard('{ArrowLeft}')
    await waitFor(() =>
      expect((router.state.location.search as { at?: string }).at).toBe('2021-01-01T00:00:00'),
    )
    expect(dialog).toBeInTheDocument()
  })

  it("still shows the board's records when the older ones can't be loaded", async () => {
    serveMap({ wrs: records([2400, 2100]) })
    server.use(http.get(`${API}/map/:id/old_wrs`, () => new HttpResponse('Not found', { status: 404 })))
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

  it("says what a rank is worth on hover, or on a tap that doesn't open the row", async () => {
    serveMap()
    await renderRoute('/map/sp/47759')
    await within(board()).findByRole('link', { name: spBoard[0]!.map_data.user_name! })
    const second = within(board()).getAllByRole('row')[2]!
    const rank = within(second).getByRole('button', { name: 'Worth 198 points' })
    await userEvent.hover(rank)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Worth 198 points')
    await userEvent.unhover(rank)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    await userEvent.click(rank)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Worth 198 points')
    expect(second).toHaveAttribute('aria-expanded', 'false')
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

  describe('with the demo viewer built in', () => {
    // (env.VITE_VIEWER is read when rendering)
    const withViewer = async (test: () => Promise<void>) => {
      const was = env.VITE_VIEWER
      env.VITE_VIEWER = true
      try {
        await test()
      } finally {
        env.VITE_VIEWER = was
      }
    }
    const demos = spBoard.map((r) => r.map_data.demo_id)
    // Where the page went: the replay page, with these runs.
    const replayed = async (router: Awaited<ReturnType<typeof renderRoute>>['router']) => {
      await waitFor(() => expect(router.state.location.pathname).toBe('/replay'))
      return replaySearchSchema.parse(router.state.location.search)
    }
    const boardLoaded = () => within(board()).findAllByRole('link', { name: 'Watch the replay' })

    it('races the top runs in the replay page', () =>
      withViewer(async () => {
        serveMap()
        const { router } = await renderRoute('/map/sp/47759')
        await boardLoaded()
        fireEvent.click(screen.getByRole('button', { name: 'Race Top 5' }))
        expect(await replayed(router)).toMatchObject({
          demo: demos[0],
          race: demos.slice(1).join(','),
          map: '47759',
          what: 'top',
        })
      }))

    it('swarms the top runs', () =>
      withViewer(async () => {
        serveMap()
        const { router } = await renderRoute('/map/sp/47759')
        await boardLoaded()
        fireEvent.click(screen.getByRole('button', { name: 'Swarm Top 100' }))
        expect(await replayed(router)).toMatchObject({
          demo: demos[0],
          swarm: demos.join(','),
          what: 'swarm',
        })
      }))

    it('races the world records with demos, the newest shown', () =>
      withViewer(async () => {
        // (one without a demo, and the newest banned: both left out)
        const wrs: ChangelogRaw[] = records([3000, 2900, 2800, 2700]).map((r, i) => ({
          ...r,
          demo_id: [11, null, 33, 44][i]!,
          banned: i === 3,
          coop_id: null,
        }))
        // (a co-op record's partner entry, a moment apart: raced once)
        wrs.push({ ...wrs[2]!, demo_id: 34, coop_id: 7, timestamp: '2021-12-31T23:59:59' })
        wrs[2] = { ...wrs[2]!, coop_id: 7 }
        const { changelogAsked } = serveMap({ wrs })
        const { router } = await renderRoute('/map/sp/47759')
        fireEvent.click(await screen.findByRole('button', { name: 'Race WR History' }))
        expect(await replayed(router)).toMatchObject({ demo: 33, race: '11', what: 'wr' })
        expect(changelogAsked.some((q) => q.get('wr_gain') && q.get('has_demo'))).toBe(true)
      }))

    it('races runs ticked on the board', () =>
      withViewer(async () => {
        serveMap()
        const { router } = await renderRoute('/map/sp/47759')
        await boardLoaded()
        fireEvent.click(screen.getByRole('button', { name: 'Pick Runs to Race' }))
        const race = screen.getByRole('button', { name: 'Race them' })
        expect(race).toBeDisabled()
        fireEvent.click(within(board()).getByRole('checkbox', { name: 'Pick #2' }))
        fireEvent.click(within(board()).getByRole('checkbox', { name: 'Pick #4' }))
        expect(screen.getByText('2', { selector: 'strong' })).toBeInTheDocument()
        fireEvent.click(race)
        expect(await replayed(router)).toMatchObject({
          demo: demos[1],
          race: String(demos[3]),
          what: 'picked',
        })
      }))
  })
})
