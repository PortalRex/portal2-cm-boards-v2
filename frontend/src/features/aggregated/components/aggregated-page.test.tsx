import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { countryById } from '@/lib/data/countries'
import { formatLongScore, formatPoints } from '@/lib/format'
import pointsSp from '@/testing/fixtures/points-sp.json'
import { users } from '@/testing/data/users'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderRoute } from '@/testing/test-utils'
import type { PointsRaw, PointsWrapperRaw } from '../types'

const SEASON = 'portal-2-season-1'

/** Serves `body` for every board and records which boards were asked for. */
function servePoints(body: PointsWrapperRaw = pointsSp as PointsWrapperRaw) {
  const asked: string[] = []
  server.use(
    http.get(`${API}/points/game/:game/:board`, ({ params }) => {
      asked.push(`${String(params.game)}/${String(params.board)}`)
      return HttpResponse.json(body)
    }),
  )
  return asked
}

const runner = (i: number, extra: Partial<PointsRaw> = {}): [string, PointsRaw] => [
  `765611990000${String(i).padStart(5, '0')}`,
  {
    points: 10000 - i,
    score: 200000 + i,
    num_scores: 60,
    user_name: `Runner ${i}`,
    avatar: null,
    country_id: null,
    ...extra,
  },
]
const runners = (n: number, extra: (i: number) => Partial<PointsRaw> = () => ({})) => ({
  id: null,
  points: Array.from({ length: n }, (_, i) => runner(i + 1, extra(i + 1))),
})

const board = (name: 'Points' | 'Time') => screen.getByRole('region', { name })
const names = (name: 'Points' | 'Time') =>
  within(board(name))
    .queryAllByRole('link')
    .map((a) => a.textContent)

describe('Aggregated boards (Portal 2)', () => {
  it('shows the points and time rankings of the board', async () => {
    const asked = servePoints()
    await renderRoute('/leaderboard/sp')
    expect(await screen.findByRole('heading', { name: 'Single Player', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Aggregated points and times')).toBeInTheDocument()
    await screen.findAllByRole('link', { name: 'hero' })
    expect(names('Points')).toEqual(['hero', 'AngerySnek', 'Flaming Bag', 'Rex', 'Super82553', 'Unknown'])
    // Only players with a time on all 60 maps have a total time.
    expect(names('Time')).toEqual(['hero', 'AngerySnek', 'Flaming Bag', 'Super82553'])
    expect(within(board('Points')).getByText(formatPoints(11582.278))).toBeInTheDocument()
    expect(within(board('Time')).getByText(formatLongScore(235083))).toBeInTheDocument()
    expect(within(board('Points')).getAllByRole('img', { name: countryById(97)!.name })).toHaveLength(2)
    expect(asked).toEqual(['1/sp'])
  })

  it('switches boards with the tabs and marks the open one', async () => {
    const asked = servePoints()
    const { router } = await renderRoute('/leaderboard/overall')
    const tabs = await screen.findByRole('navigation', { name: 'Portal 2 boards' })
    expect(within(tabs).getByRole('link', { name: 'Overall' })).toHaveAttribute('aria-current', 'page')
    await userEvent.click(within(tabs).getByRole('link', { name: 'Cooperative' }))
    expect(await screen.findByRole('heading', { name: 'Cooperative', level: 1 })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/leaderboard/coop')
    await waitFor(() => expect(asked).toEqual(['1/overall', '1/coop']))
  })

  it('pages through 20 players at a time', async () => {
    servePoints(runners(45))
    await renderRoute('/leaderboard/sp')
    await within(await screen.findByRole('region', { name: 'Points' })).findByRole('link', {
      name: 'Runner 1',
    })
    expect(names('Points')).toHaveLength(20)
    await userEvent.click(within(board('Points')).getByRole('button', { name: 'Next page' }))
    expect(names('Points')[0]).toBe('Runner 21')
    expect(within(board('Points')).getByText('21')).toBeInTheDocument()
    // Each board has its own pages.
    expect(names('Time')[0]).toBe('Runner 1')
  })

  it("opens on a linked player's page with their row marked (?player=)", async () => {
    servePoints(runners(45))
    await renderRoute('/leaderboard/overall?player=76561199000000030')
    const link = await within(await screen.findByRole('region', { name: 'Points' })).findByRole('link', {
      name: 'Runner 30',
    })
    expect(names('Points')[0]).toBe('Runner 21')
    expect(link.closest('[data-focused]')).not.toBeNull()
    expect(
      within(board('Points'))
        .getAllByRole('link')
        .filter((a) => a.closest('[data-focused]')),
    ).toHaveLength(1)
  })

  it("marks the signed-in player's own row", async () => {
    servePoints({ id: null, points: [runner(1), [users.player.profile_number, runner(2)[1]]] })
    await renderRoute('/leaderboard/overall', { user: 'player' })
    const mine = await within(await screen.findByRole('region', { name: 'Points' })).findByRole('link', {
      name: 'Runner 2',
    })
    expect(mine.closest('.me-row')).not.toBeNull()
    expect(within(board('Points')).getByRole('link', { name: 'Runner 1' }).closest('.me-row')).toBeNull()
  })

  it("filters to one country's players, ranked within it, kept when switching boards", async () => {
    servePoints(runners(6, (i) => ({ country_id: i % 2 ? 97 : 13 })))
    const { router } = await renderRoute('/leaderboard/sp')
    const hungary = countryById(97)!
    const select = await screen.findByRole('combobox', { name: 'Country' })
    await userEvent.selectOptions(select, hungary.name)
    await waitFor(() => expect(names('Points')).toEqual(['Runner 1', 'Runner 3', 'Runner 5']))
    expect(router.state.location.search).toEqual({ country: hungary.code })
    const rows = within(board('Points'))
      .getAllByRole('link')
      .map((a) => a.closest('div')!)
    expect(rows.map((r) => within(r).getAllByText(/^\d+$/)[0]!.textContent)).toEqual(['1', '2', '3'])
    const tabs = screen.getByRole('navigation', { name: 'Portal 2 boards' })
    expect(within(tabs).getByRole('link', { name: 'Overall' })).toHaveAttribute(
      'href',
      `/leaderboard/overall?country=${hungary.code}`,
    )
  })

  it('shares a place between equal points and gives players without points none', async () => {
    // Runners 2 and 3 tie; runners 5 and 6 have no points (in a country, all of them would be "1st").
    servePoints(runners(6, (i) => ({ points: [900, 800, 800, 700, 0, 0][i - 1]! })))
    await renderRoute('/leaderboard/sp')
    await waitFor(() => expect(names('Points')).toHaveLength(6))
    const places = within(board('Points'))
      .getAllByRole('link')
      .map((a) => within(a.closest('div')!).getAllByText(/^(\d+|–)$/)[0]!.textContent)
    expect(places).toEqual(['1', '2', '2', '4', '–', '–'])
  })

  it('opens a chapter from the Single Player chapter list', async () => {
    servePoints()
    const { router } = await renderRoute('/leaderboard/sp')
    const select = await screen.findByRole('combobox', { name: 'Chapter' })
    expect(within(select).getByRole('option', { name: 'All chapters' })).toBeInTheDocument()
    await userEvent.selectOptions(select, 'Chapter 1: The Courtesy Call')
    await waitFor(() => expect(router.state.location.pathname).toBe('/leaderboard/chapter/7'))
  })

  it("shows a season's copy of the board, without the chapter list", async () => {
    const asked = servePoints()
    await renderRoute(`/leaderboard/coop?season=${SEASON}`)
    expect(await screen.findByText('Portal 2 Season 1 · 2026-10-15 – 2026-10-30')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Season' })).toHaveValue(SEASON)
    expect(screen.queryByRole('combobox', { name: 'Chapter' })).not.toBeInTheDocument()
    await screen.findAllByRole('link', { name: 'hero' })
    expect(asked).toEqual(['4/coop'])
    const tabs = screen.getByRole('navigation', { name: 'Portal 2 boards' })
    expect(within(tabs).getByRole('link', { name: 'Overall' })).toHaveAttribute(
      'href',
      `/leaderboard/overall?season=${SEASON}`,
    )
  })

  it('picks a season, keeping the board', async () => {
    servePoints()
    const { router } = await renderRoute('/leaderboard/sp')
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Season' }), SEASON)
    await waitFor(() => expect(router.state.location.search).toEqual({ season: SEASON }))
    expect(router.state.location.pathname).toBe('/leaderboard/sp')
  })

  it('opens the running season at /leaderboard/season', async () => {
    servePoints()
    const { router } = await renderRoute('/leaderboard/season')
    await waitFor(() => expect(router.state.location.href).toBe(`/leaderboard/overall?season=${SEASON}`))
  })

  it('sends an unknown board to the overall board', async () => {
    servePoints()
    const { router } = await renderRoute('/leaderboard/nope')
    await waitFor(() => expect(router.state.location.pathname).toBe('/leaderboard/overall'))
    expect(await screen.findByRole('heading', { name: 'Overall', level: 1 })).toBeInTheDocument()
  })

  it('says so when nobody has a time on every map', async () => {
    servePoints(runners(2, () => ({ num_scores: 10 })))
    await renderRoute('/leaderboard/sp')
    expect(await screen.findByText('No one has a time on all 60 maps yet.')).toBeInTheDocument()
    expect(names('Points')).toEqual(['Runner 1', 'Runner 2'])
  })

  it('shows an error state when the board fails to load', async () => {
    server.use(
      http.get(`${API}/points/game/:game/:board`, () =>
        HttpResponse.json({ error: 'Points cache warming up' }, { status: 503 }),
      ),
    )
    await renderRoute('/leaderboard/overall')
    expect(await screen.findByText('Points cache warming up')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Points' })).not.toBeInTheDocument()
  })
})

describe('Aggregated boards (Mel, chapters, other games)', () => {
  it("shows Mel's boards with Mel's tabs", async () => {
    const asked = servePoints()
    await renderRoute('/leaderboard/mel/story')
    expect(await screen.findByRole('heading', { name: 'Story Mode', level: 1 })).toBeInTheDocument()
    const tabs = screen.getByRole('navigation', { name: 'Mel boards' })
    expect(
      within(tabs)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual(['/leaderboard/mel/overall', '/leaderboard/mel/story', '/leaderboard/mel/advanced'])
    expect(screen.queryByRole('combobox', { name: 'Chapter' })).not.toBeInTheDocument()
    await screen.findAllByRole('link', { name: 'hero' })
    expect(asked).toEqual(['2/story'])
  })

  it("shows a Portal 2 chapter's board, with the chapter picked in the list", async () => {
    const asked = servePoints()
    await renderRoute('/leaderboard/chapter/7')
    expect(await screen.findByRole('heading', { name: 'The Courtesy Call', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Singleplayer · Chapter 1')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Chapter' })).toHaveValue('/leaderboard/chapter/7')
    const tabs = screen.getByRole('navigation', { name: 'Portal 2 boards' })
    expect(within(tabs).getByRole('link', { name: 'Single Player' })).toHaveAttribute('aria-current', 'page')
    // A chapter needs a time on its 9 maps.
    await screen.findAllByRole('link', { name: 'hero' })
    // The same rows served for a 9-map chapter: Rex's 57 times now count, with the lowest total.
    expect(names('Time')).toEqual(['Rex', 'hero', 'AngerySnek', 'Flaming Bag', 'Super82553'])
    expect(asked).toEqual(['1/chapter-7'])
  })

  it('names co-op courses as courses', async () => {
    servePoints()
    await renderRoute('/leaderboard/chapter/1')
    expect(await screen.findByText('Cooperative · Course 1')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Chapter' })).toHaveDisplayValue('Course 1: Team Building')
  })

  it("picking a season on a chapter opens the season's copy of the mode's board", async () => {
    servePoints()
    const { router } = await renderRoute('/leaderboard/chapter/7')
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Season' }), SEASON)
    await waitFor(() => expect(router.state.location.href).toBe(`/leaderboard/sp?season=${SEASON}`))
  })

  it("shows another game's boards, asked for by the chapters' game_mode", async () => {
    const asked = servePoints()
    await renderRoute('/leaderboard/game/custom-game/custom-game-sp')
    expect(await screen.findByRole('heading', { name: 'Main Board', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Custom Game', { selector: 'header p' })).toBeInTheDocument()
    const tabs = screen.getByRole('navigation', { name: 'Custom Game boards' })
    expect(
      within(tabs)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Overall', 'Main Board'])
    await screen.findAllByRole('link', { name: 'hero' })
    expect(asked).toEqual(['3/sp'])
    // The game has 3 maps: everyone in the fixture but the one-time player has a total.
    expect(names('Time')).not.toContain('Unknown')
    expect(names('Time')).toHaveLength(5)
  })
})
