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
    expect(within(stats).getByText('Laser Stairs')).toBeInTheDocument()
    expect(within(stats).getByText('Funnel Catch')).toBeInTheDocument()

    expect(within(card('World Records')).getByText('19')).toBeInTheDocument()
    expect(within(card('Average Place')).getByText('4.5')).toBeInTheDocument()
    const peak = card('Peak Points')
    await within(peak).findByText('11717')
    expect(within(peak).getAllByText(formatDate('2024-06-10'))).toHaveLength(2)
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

  it('sorts every map of the mode into one table', async () => {
    serveProfile()
    await renderProfile()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort maps' }), 'Best rank first')
    expect(screen.getByRole('heading', { name: 'Best rank first', level: 3 })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'The Courtesy Call', level: 3 })).not.toBeInTheDocument()
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

  it('says so when the player has no results in a season', async () => {
    serveProfile()
    await renderRoute(`/profile/${FIXTURE_PLAYER}`)
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Season' }), SEASON)
    expect(
      await screen.findByText('No Portal 2 Season 1 Singleplayer scores for this player.'),
    ).toBeInTheDocument()
  })

  it('shows the profile as it was on a past day, until going back to today', async () => {
    serveProfile()
    const { router } = await renderProfile(`/profile/${FIXTURE_PLAYER}?at=2024-01-01`)
    expect(await screen.findByText(/Showing hero’s profile as it was on/)).toBeInTheDocument()
    await within(card('Challenge Mode Points')).findByText(formatPoints(11579))
    // Newest score and best place, that day.
    expect(within(card('Statistics')).getAllByText('Laser Crusher')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Back to today' }))
    await waitFor(() => expect(router.state.location.search).toEqual({}))
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
