import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { formatDate, formatPoints } from '@/lib/format'
import changelog from '@/testing/fixtures/profile-changelog.json'
import { users } from '@/testing/data/users'
import { API } from '@/testing/mocks/handlers'
import { FIXTURE_PLAYER, serveProfile } from '@/testing/mocks/profile'
import { server } from '@/testing/mocks/server'
import { renderRoute, renderWithProviders } from '@/testing/test-utils'
import type { RenderRunDetails } from '../types'
import { recentFrom } from '../utils/aggregated'
import { ProfilePage } from './profile-page'

const SEASON = 'portal-2-season-1'

// Run details belong to features/runs; here a stub shows which run a row opened.
const details: RenderRunDetails = (run, map, game) => (
  <div data-testid="run-details">
    {map.title} · {game} · {run.changelogId} · {(run.players ?? []).map((p) => p.name).join(' & ')}
  </div>
)

async function renderProfile(route = `/profile/${FIXTURE_PLAYER}`, options = {}) {
  const at = new URL(route, 'http://x').searchParams.get('at') ?? undefined
  const result = await renderWithProviders(
    <ProfilePage profileId={FIXTURE_PLAYER} at={at} renderRunDetails={details} />,
    { route, ...options },
  )
  await screen.findByRole('heading', { name: /hero/, level: 1 })
  return result
}

const card = (title: string) =>
  screen.getByRole('button', { name: new RegExp(`^${title}`, 'i') }).closest('section')!
const tab = (name: string) => screen.getByRole('tab', { name })

describe('Profile page', () => {
  it("shows the player's name in their role's colour, badges, country and links", async () => {
    serveProfile()
    await renderProfile()
    const name = screen.getByRole('heading', { name: /hero/, level: 1 })
    // Legends is kept once the peak reached it, though today's points fall short.
    expect(name).toHaveAttribute('title', 'Legends (reached at peak points, kept for good)')
    expect(within(name).getByRole('img', { name: 'Legends' })).toHaveAttribute('src', '/roles/legends.png')
    expect(screen.getByText('Donator')).toBeInTheDocument()
    expect(screen.getAllByText('Verifier').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Hungary').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Steam' })).toHaveAttribute(
      'href',
      `https://steamcommunity.com/profiles/${FIXTURE_PLAYER}`,
    )
    expect(screen.getByRole('link', { name: 'Twitch' })).toHaveAttribute('href', 'https://twitch.tv/heroeen')
    expect(screen.getByRole('link', { name: 'YouTube' })).toHaveAttribute(
      'href',
      'https://www.youtube.com/channel/UC-SnOS5mev1CmSTVvLbFxMw',
    )
  })

  it('shows points, places linking to the boards, and the statistics cards', async () => {
    serveProfile()
    await renderProfile()
    const points = card('Challenge Mode Points')
    expect(within(points).getByText(formatPoints(11582.278))).toBeInTheDocument()
    expect(within(points).getAllByLabelText(/points to Legends|threshold reached/)).toHaveLength(3)

    const ranks = card('Global Rank')
    expect(within(ranks).getByRole('link', { name: /Singleplayer/ })).toHaveAttribute(
      'href',
      `/leaderboard/sp?player=${FIXTURE_PLAYER}`,
    )
    expect(within(ranks).getByRole('link', { name: /In Hungary/ })).toHaveAttribute(
      'href',
      `/leaderboard/overall?country=hu&player=${FIXTURE_PLAYER}`,
    )

    const stats = card('Statistics')
    expect(within(stats).getByText('Catapults')).toBeInTheDocument()
    expect(within(stats).getByText('Team Retrieval')).toBeInTheDocument()
    // hero is 1st on every map they hold the record on: the card says how many, with no one map to open.
    expect(within(stats).getByText('19 maps')).toBeInTheDocument()
    expect(within(stats).queryByRole('link', { name: /1st/ })).not.toBeInTheDocument()
    expect(within(stats).getByText('Funnel Catch')).toBeInTheDocument()
    // Newest and oldest score, and a place on one map, open their map.
    expect(within(stats).getByRole('link', { name: /on Catapults/ })).toHaveAttribute(
      'href',
      '/map/coop/47840',
    )
    expect(within(stats).getByRole('link', { name: /on Team Retrieval/ })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/map\/coop\/\d+$/),
    )
    expect(within(stats).getByRole('link', { name: /17th\s*on Funnel Catch/ })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/map\/sp\/\d+$/),
    )

    expect(within(card('World Records')).getByText('19')).toBeInTheDocument()
    expect(within(card('Average Place')).getByText('4.5')).toBeInTheDocument()
    const peak = card('Peak Points')
    await within(peak).findByText('11717')
    expect(within(peak).getAllByText(formatDate('2024-06-10'))).toHaveLength(2)
  })

  it('opens the profile on the day of a peak when the peak is clicked', async () => {
    serveProfile()
    const { router } = await renderProfile()
    const peak = card('Peak Points')
    await within(peak).findByText('11717')
    await userEvent.click(within(peak).getByRole('button', { name: /11717/ }))
    await waitFor(() => expect(router.state.location.search).toEqual({ at: '2024-06-10' }))
  })

  it('collapses and opens every card at once', async () => {
    serveProfile()
    await renderProfile()
    await userEvent.click(screen.getByRole('button', { name: /Collapse all/ }))
    expect(screen.getByRole('button', { name: /Challenge Mode Points/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.getByRole('button', { name: /Peak Points/ })).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(screen.getByRole('button', { name: /Expand all/ }))
    expect(screen.getByRole('button', { name: /Peak Points/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it("opens a map's run from the summary, narrowing the history to that map", async () => {
    serveProfile()
    await renderProfile()
    expect(tab('Singleplayer')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument()
    await userEvent.click(screen.getByTitle('Portal Gun — rank 4'))
    expect(await screen.findByTestId('run-details')).toHaveTextContent(/^Portal Gun · portal2 · 336335 ·$/)
    expect(screen.getByRole('heading', { name: 'History · Portal Gun' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Hide run details for Portal Gun' }))
    expect(screen.queryByTestId('run-details')).not.toBeInTheDocument()
  })

  it('shows co-op partners, and links maps without a run to the map page', async () => {
    serveProfile()
    await renderProfile()
    await userEvent.click(tab('Cooperative'))
    // The chapter tables hand over the score itself (legacy passed no players from there).
    await userEvent.click(screen.getByRole('button', { name: 'Show run details for Buttons' }))
    expect(screen.getByTestId('run-details')).toHaveTextContent(/^Buttons · portal2 · 286767 ·$/)
    expect(screen.getAllByRole('link', { name: 'Rex' }).length).toBeGreaterThan(0)
    // Chapter averages lead to the chapter's board on the player's row.
    expect(screen.getByRole('link', { name: /Course 1.*Team Building/ })).toHaveAttribute(
      'href',
      `/leaderboard/chapter/1?player=${FIXTURE_PLAYER}`,
    )
  })

  it("opens the player's history on a map without a score from its dash (to find banned runs)", async () => {
    const melRun = { ...changelog[5]!, id: 900001, map_id: '1', map_name: 'Tramride', coop_id: null }
    serveProfile({ gameRanks: { '2': { '1': 3 } }, gameRuns: [melRun] })
    await renderProfile(`/profile/${FIXTURE_PLAYER}?game=mel`)
    // Every Mel map but Tramride has no score.
    const unplayed = (await screen.findAllByText('No score'))[0]!.closest('[id]') as HTMLElement
    const map = within(unplayed).getAllByRole('link')[0]!.textContent!
    expect(within(unplayed).getAllByText('–').length).toBeGreaterThanOrEqual(2)
    await userEvent.click(within(unplayed).getByTitle(new RegExp(`history on ${map}$`)))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('link', { name: map })).toBeInTheDocument()
  })

  it('sorts every map of the mode into one table', async () => {
    serveProfile()
    await renderProfile()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort maps' }), 'Best rank first')
    expect(screen.getByRole('heading', { name: 'Best rank first', level: 3 })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'The Courtesy Call', level: 3 })).not.toBeInTheDocument()
    const first = () => screen.getAllByRole('button', { name: /^Show run details for / })[0]
    // Worst first: hero's worst place (17th, Funnel Catch) leads.
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort maps' }), 'Worst rank first')
    expect(screen.getByRole('heading', { name: 'Worst rank first', level: 3 })).toBeInTheDocument()
    expect(first()).toHaveAccessibleName('Show run details for Funnel Catch')
  })

  it('sorts by a column from its header, the other way on a second click, and not on a third', async () => {
    serveProfile()
    await renderProfile()
    const select = screen.getByRole('combobox', { name: 'Sort maps' })
    // The score tables' headers, not the aggregated card's.
    const headers = () =>
      screen.getAllByRole('button', { name: 'Sort by Points' }).filter((b) => !b.closest('[role="table"]'))
    await userEvent.click(headers()[0]!)
    expect(screen.getByRole('heading', { name: 'Most points first', level: 3 })).toBeInTheDocument()
    expect(select).toHaveValue('points')
    // Every chapter's maps in it: its title isn't a link to chapter 1's board.
    expect(
      within(screen.getByRole('heading', { name: 'Most points first', level: 3 })).queryByRole('link'),
    ).not.toBeInTheDocument()
    // One table now, its header showing the order.
    const [header] = headers()
    expect(headers()).toHaveLength(1)
    expect(header).toHaveAttribute('title', 'Fewest points first')
    await userEvent.click(header!)
    expect(screen.getByRole('heading', { name: 'Fewest points first', level: 3 })).toBeInTheDocument()
    expect(select).toHaveValue('points-asc')
    // The third click turns the sorting off: the chapters again.
    expect(headers()[0]).toHaveAttribute('title', 'Map order')
    await userEvent.click(headers()[0]!)
    expect(select).toHaveValue('default')
    expect(screen.queryByRole('heading', { name: /points first/, level: 3 })).not.toBeInTheDocument()
    expect(headers().length).toBeGreaterThan(1)
  })

  it('shows the Legacy view and the Info tab', async () => {
    serveProfile()
    await renderProfile()
    await userEvent.click(tab('Legacy'))
    await userEvent.click(screen.getByRole('button', { name: /Smooth Jazz/ }))
    expect(screen.getByTestId('run-details')).toHaveTextContent('Smooth Jazz · portal2 · 311616 · hero')
    expect(screen.getByRole('link', { name: 'Smooth Jazz board →' })).toHaveAttribute('href', '/map/sp/47455')

    await userEvent.click(tab('Info'))
    const info = screen.getByRole('tabpanel')
    expect(within(info).getByText(FIXTURE_PLAYER)).toBeInTheDocument()
    expect(within(info).getByText('Verifier')).toBeInTheDocument()
    expect(within(info).getByRole('link', { name: 'heroeen' })).toBeInTheDocument()
  })

  it("shows the picked game in the cards above the tabs: Mel's boards, not Portal 2's", async () => {
    const melRun = {
      ...changelog[5]!,
      id: 900001,
      map_id: '1',
      map_name: 'Tramride',
      score: 4321,
      coop_id: null,
    }
    const requests = serveProfile({
      gameRanks: { '2': { '1': 1 } },
      gameRuns: [melRun],
      aggregated: [
        { board: 'story', points: { rank: 4, value: 4305, next: -2, wr: -14 }, time: null },
        { board: 'advanced', points: { rank: 9, value: 1200, next: -5, wr: -90 }, time: null },
        { board: 'overall', points: { rank: 6, value: 5505, next: -3, wr: -100 }, time: null },
      ],
    })
    await renderProfile(`/profile/${FIXTURE_PLAYER}?game=mel`)
    const points = card('Challenge Mode Points')
    await waitFor(() => expect(within(points).getByText(formatPoints(4305))).toBeInTheDocument())
    expect(within(points).getByText('Story Mode')).toBeInTheDocument()
    expect(within(points).getByText('Advanced Mode')).toBeInTheDocument()
    expect(within(points).queryByText('Singleplayer')).toBeNull()
    // Community roles (the progress bars) are Portal 2's.
    expect(within(points).queryAllByLabelText(/points to|threshold reached|count from/)).toHaveLength(0)

    const ranks = card('Global Rank')
    expect(within(ranks).getByRole('link', { name: /Story Mode/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/leaderboard/mel/story'),
    )
    expect(within(ranks).queryByText(/^In /)).toBeNull()

    await waitFor(() => expect(within(card('World Records')).getAllByText('1')).toHaveLength(2)) // Story and overall
    expect(within(card('Statistics')).getAllByText('Tramride').length).toBeGreaterThan(0)
    // Activity counts Mel's one run, not the player's Portal 2 runs.
    const activity = card('Activity')
    await userEvent.selectOptions(within(activity).getByRole('combobox', { name: 'Year' }), 'All time')
    expect(within(activity).getByText('1', { selector: 'strong' })).toBeInTheDocument()
    expect(requests.asked).toContain(`/profile/points_peak/${FIXTURE_PLAYER}?game_id=2`)
    await waitFor(() =>
      expect(requests.asked).toContain(`/profile/points_history/${FIXTURE_PLAYER}?game_id=2`),
    )
  })

  it("shows another game's results in its own tab", async () => {
    const melRun = {
      ...changelog[5]!,
      id: 900001,
      map_id: '1',
      map_name: 'Tramride',
      score: 4321,
      coop_id: null,
    }
    const requests = serveProfile({ gameRanks: { '2': { '1': 3 } }, gameRuns: [melRun] })
    await renderProfile(`/profile/${FIXTURE_PLAYER}?game=mel`)
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Portal Stories: Mel',
      'Stats',
      'Info',
    ])
    const tramride = await screen.findByTitle('Tramride — rank 3')
    await userEvent.click(tramride)
    expect(screen.getByTestId('run-details')).toHaveTextContent('Tramride · mel · 900001')
    expect(requests.asked).toContain(`/ranks/game/2/${FIXTURE_PLAYER}`)
    expect(requests.asked).toContain(`/changelog?profile_number=${FIXTURE_PLAYER}&limit=5000&game_id=2`)
  })

  it('shows aggregated points and times per chapter and in total, as of the day looked back to', async () => {
    const requests = serveProfile({
      aggregated: [
        {
          board: 'chapter-7',
          points: { rank: 14, value: 1443.4, next: -26.2, wr: -310.1 },
          time: { rank: 21, value: 66693, next: 95, wr: 1373 },
        },
        { board: 'overall', points: { rank: 6, value: 18902, next: -402, wr: -1947 }, time: null },
      ],
    })
    const { unmount } = await renderProfile()
    const points = await screen.findByRole('table', { name: 'Points' })
    const times = screen.getByRole('table', { name: 'Times' })
    const chapter = within(points).getByRole('row', { name: /The Courtesy Call/ })
    expect(
      within(chapter)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['14', '1443', '-26', '-310'])
    expect(within(chapter).getByRole('link', { name: 'The Courtesy Call' })).toHaveAttribute(
      'href',
      `/leaderboard/chapter/7?player=${FIXTURE_PLAYER}`,
    )
    const chapterTime = within(times).getByRole('row', { name: /The Courtesy Call/ })
    expect(
      within(chapterTime)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['21', '11:06.93', '+0.95', '+13.73'])
    // No time on boards the player hasn't finished every map of.
    const overallTime = within(times).getByRole('row', { name: /Overall/ })
    expect(
      within(overallTime)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['–', '–', '–', '–'])
    expect(requests.asked).toContain(`/profile/aggregated/${FIXTURE_PLAYER}?game_id=1`)
    unmount()
    await renderProfile(`/profile/${FIXTURE_PLAYER}?at=2021-04-06`)
    await waitFor(() =>
      expect(requests.asked).toContain(`/profile/aggregated/${FIXTURE_PLAYER}?game_id=1&at=2021-04-06`),
    )
  })

  it('marks the points that changed in the last 30 days with a green or red arrow', async () => {
    const board = (key: string, value: number) => ({
      board: key,
      points: { rank: 5, value, next: -10, wr: -100 },
      time: null,
    })
    serveProfile({
      aggregated: [board('chapter-7', 1450.5), board('chapter-8', 900), board('overall', 18900)],
    })
    // A month back: chapter 7 lower, chapter 8 higher (passed since), overall the same.
    server.use(
      http.get(`${API}/profile/aggregated/:id`, ({ request }) => {
        const at = new URL(request.url).searchParams.get('at')
        return HttpResponse.json(
          at === recentFrom(null)
            ? [board('chapter-7', 1438), board('chapter-8', 912), board('overall', 18900)]
            : [board('chapter-7', 1450.5), board('chapter-8', 900), board('overall', 18900)],
        )
      }),
    )
    await renderProfile()
    const points = await screen.findByRole('table', { name: 'Points' })
    const row = (name: RegExp) => within(points).getByRole('row', { name })
    expect(
      await within(row(/The Courtesy Call/)).findByRole('img', { name: '+12.5 points in the last 30 days' }),
    ).toBeInTheDocument()
    expect(
      within(row(/The Cold Boot/)).getByRole('img', { name: '-12 points in the last 30 days' }),
    ).toBeInTheDocument()
    expect(within(row(/Overall/)).queryByRole('img')).not.toBeInTheDocument()
  })

  it('sorts an aggregated table from its headers: best first, reversed, then chapter order', async () => {
    serveProfile({
      aggregated: [
        { board: 'chapter-7', points: { rank: 14, value: 1443, next: -26, wr: -310 }, time: null },
        { board: 'chapter-8', points: { rank: 12, value: 1387, next: -6, wr: -182 }, time: null },
      ],
    })
    await renderProfile()
    const points = await screen.findByRole('table', { name: 'Points' })
    const firstTwo = () =>
      within(within(points).getAllByRole('rowgroup')[0]!)
        .getAllByRole('rowheader')
        .slice(0, 2)
        .map((c) => c.textContent)
    const [courtesy, coldBoot] = firstTwo()
    const button = within(points).getByRole('button', { name: 'Sort by Δnext' })
    await userEvent.click(button)
    expect(firstTwo()).toEqual([coldBoot, courtesy])
    expect(button.closest('[role="columnheader"]')).toHaveAttribute('aria-sort', 'ascending')
    await userEvent.click(button)
    expect(firstTwo()).toEqual([courtesy, coldBoot])
    expect(button.closest('[role="columnheader"]')).toHaveAttribute('aria-sort', 'descending')
    await userEvent.click(button)
    expect(button.closest('[role="columnheader"]')).toHaveAttribute('aria-sort', 'none')
    // The Times table keeps its own order.
    const times = screen.getByRole('table', { name: 'Times' })
    expect(
      within(times).getByRole('button', { name: 'Sort by place' }).closest('[role="columnheader"]'),
    ).toHaveAttribute('aria-sort', 'none')
  })

  it("shows the picked game's aggregated boards: Mel's, not Portal 2's", async () => {
    const requests = serveProfile({
      aggregated: [
        { board: 'story', points: { rank: 2, value: 4000, next: -20, wr: -100 }, time: null },
        { board: 'overall', points: { rank: 4, value: 7000, next: -30, wr: -300 }, time: null },
      ],
    })
    await renderProfile(`/profile/${FIXTURE_PLAYER}?game=mel`)
    const points = await screen.findByRole('table', { name: 'Points' })
    await waitFor(() => expect(within(points).getByRole('row', { name: /Story/ })).toBeInTheDocument())
    expect(within(points).queryByRole('row', { name: /Single Player/ })).toBeNull()
    expect(within(points).getByRole('link', { name: /Story/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/leaderboard/mel/story'),
    )
    expect(requests.asked).toContain(`/profile/aggregated/${FIXTURE_PLAYER}?game_id=2`)
  })

  it('says so when the player has no Portal 2 times for the aggregated tables', async () => {
    serveProfile()
    server.use(
      http.get(
        `${API}/profile/aggregated/:id`,
        () => new HttpResponse('No runs for this player.', { status: 404 }),
      ),
    )
    await renderProfile()
    expect(await screen.findByText('No Portal 2 times yet.')).toBeInTheDocument()
  })

  it('says so when the player has no results in a season', async () => {
    serveProfile()
    await renderRoute(`/profile/${FIXTURE_PLAYER}`)
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Season' }), SEASON)
    expect(
      await screen.findByText('No Portal 2 Season 1 Singleplayer scores for this player.'),
    ).toBeInTheDocument()
  })

  it("shows a season's co-op best where the player's half is the partner's run", async () => {
    // The season's Buttons: their partner's half, the bundle naming them (no run of their own).
    const partner = { pn: '76561199013726692', name: 'savvydruid' }
    const requests = serveProfile({
      gameRanks: { '4': { 's4-47825': 1 } },
      gameScores: {
        '4': [
          {
            map_id: 's4-47825',
            score: 1831,
            timestamp: '2026-10-25T17:07:59',
            changelog_id: 366572,
            rank: null,
            partner_profile_number: partner.pn,
            partner_name: partner.name,
            partner_avatar: null,
          },
        ],
      },
    })
    await renderRoute(`/profile/${FIXTURE_PLAYER}`)
    await userEvent.click(await screen.findByRole('tab', { name: 'Cooperative' }))
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Season' }), SEASON)
    const row = (await screen.findByRole('link', { name: 'Buttons' })).closest('[id]') as HTMLElement
    expect(row).toHaveTextContent('18.31')
    expect(within(row).getByRole('link', { name: partner.name })).toHaveAttribute(
      'href',
      `/profile/${partner.pn}`,
    )
    expect(requests.asked).toContain(`/profile/scores/${FIXTURE_PLAYER}?game_id=4`)
  })

  it('shows the profile as it was on a past day, until going back to today', async () => {
    serveProfile()
    const { router } = await renderProfile(`/profile/${FIXTURE_PLAYER}?at=2024-01-01`)
    expect(await screen.findByText(/Showing hero’s profile as it was on/)).toBeInTheDocument()
    await within(card('Challenge Mode Points')).findByText(formatPoints(11579))
    // Newest score that day; best and worst place were each shared by several maps.
    expect(within(card('Statistics')).getByText('Laser Crusher')).toBeInTheDocument()
    expect(within(card('Statistics')).getAllByText(/^\d+ maps$/)).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Back to today' }))
    await waitFor(() => expect(router.state.location.search).toEqual({}))
  })

  it('shows the profile on a day picked in the date box, from the first day with points', async () => {
    serveProfile()
    const { router } = await renderRoute(`/profile/${FIXTURE_PLAYER}`)
    await userEvent.click(await screen.findByRole('button', { name: 'See the profile as it was on' }))
    await userEvent.click(screen.getByRole('button', { name: /choose a month/ }))
    // The points history starts on 2020-06-14: no earlier year.
    while (screen.queryByText('2020') === null)
      await userEvent.click(screen.getByRole('button', { name: 'Previous year' }))
    expect(screen.getByRole('button', { name: 'Previous year' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Jun' }))
    expect(screen.getByRole('button', { name: '2020-06-13' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '2020-06-20' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ at: '2020-06-20' }))
    expect(await screen.findByText(/Showing hero’s profile as it was on/)).toBeInTheDocument()
  })

  it('offers compare and, on your own profile, edit', async () => {
    serveProfile()
    await renderProfile()
    expect(screen.getByRole('link', { name: 'Compare' })).toHaveAttribute(
      'href',
      `/compare?a=${FIXTURE_PLAYER}`,
    )
    expect(screen.queryByRole('link', { name: 'Edit profile' })).not.toBeInTheDocument()
  })

  it('compares with you when signed in', async () => {
    serveProfile()
    await renderProfile(`/profile/${FIXTURE_PLAYER}`, { user: 'player' })
    expect(screen.getByRole('link', { name: 'Compare' })).toHaveAttribute(
      'href',
      `/compare?a=${users.player.profile_number}&b=${FIXTURE_PLAYER}`,
    )
  })

  it('links your own profile to Settings', async () => {
    serveProfile()
    await renderProfile(`/profile/${FIXTURE_PLAYER}`, {
      user: { ...users.player, profile_number: FIXTURE_PLAYER },
    })
    expect(screen.getByRole('link', { name: 'Edit profile' })).toHaveAttribute('href', '/more/settings')
  })

  it('follows the player in this browser', async () => {
    serveProfile()
    await renderProfile()
    const follow = screen.getByRole('button', { name: 'Follow' })
    expect(follow).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(follow)
    expect(follow).toHaveAttribute('aria-pressed', 'true')
    expect(JSON.parse(localStorage.getItem('p2cm.follows')!)).toEqual([
      { profileNumber: FIXTURE_PLAYER, name: 'hero', avatar: expect.any(String) as unknown },
    ])
    await userEvent.click(follow)
    expect(JSON.parse(localStorage.getItem('p2cm.follows')!)).toEqual([])
  })

  it("says so when the profile can't be loaded", async () => {
    serveProfile()
    server.use(http.get(`${API}/profile/:id`, () => HttpResponse.json({ error: 'nope' }, { status: 404 })))
    await renderWithProviders(<ProfilePage profileId="1" />)
    expect(await screen.findByText('Couldn’t load this profile.')).toBeInTheDocument()
  })
})
