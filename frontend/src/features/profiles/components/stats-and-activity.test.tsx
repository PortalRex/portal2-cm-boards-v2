import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { adaptChangelog } from '@/lib/adapters/runs'
import { BUILTIN_CATALOG } from '@/lib/catalog'
import { formatScore } from '@/lib/format'
import changelog from '@/testing/fixtures/profile-changelog.json'
import { API } from '@/testing/mocks/handlers'
import { FIXTURE_PLAYER, serveProfile } from '@/testing/mocks/profile'
import { server } from '@/testing/mocks/server'
import { renderRoute, renderWithProviders } from '@/testing/test-utils'
import type { ChangelogRaw } from '@/types/runs'
import { ActivityHeatmap } from './activity-heatmap'
import { StatsTab } from './stats-tab'

const SEASON = 'portal-2-season-1'
const history = (changelog as ChangelogRaw[]).map((r) => adaptChangelog(r, 'portal2', BUILTIN_CATALOG))

describe('ActivityHeatmap', () => {
  it("sums the player's runs per day, by year or over their whole career", async () => {
    await renderWithProviders(<ActivityHeatmap history={history} />)
    const year = screen.getByRole('combobox', { name: 'Year' })
    await userEvent.selectOptions(year, '2026')
    // Five unbanned runs in the fixture are from 2026, two of them on 8 October.
    expect(screen.getByText('5', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText(/runs in 2026/)).toBeInTheDocument()
    const day = screen.getByRole('img', { name: /^2 runs on Oct 8, 2026$/ })
    fireEvent.mouseEnter(day)
    const tip = screen.getByRole('tooltip')
    expect(within(tip).getAllByText('Catapults')).toHaveLength(2)
    expect(within(tip).getByText(formatScore(1205))).toBeInTheDocument()

    await userEvent.selectOptions(year, 'All time')
    expect(screen.getByText(/runs since 2022/)).toBeInTheDocument()
    expect(screen.getByText(/each square is \d+ days/)).toBeInTheDocument()
  })

  it('shows nothing without runs', async () => {
    const { container } = await renderWithProviders(<ActivityHeatmap history={[]} />)
    expect(container.querySelector('[data-heat-cell]')).toBeNull()
  })

  it('appears on the profile as its own card', async () => {
    serveProfile()
    await renderRoute(`/profile/${FIXTURE_PLAYER}`)
    expect(await screen.findByRole('button', { name: /Activity/ })).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('StatsTab', () => {
  it("shows the player's figures, co-op partners and fewest portals", async () => {
    serveProfile()
    await renderWithProviders(<StatsTab profileNumber={FIXTURE_PLAYER} game="portal2" />)
    expect(await screen.findByText('1740')).toBeInTheDocument()
    expect(screen.getByText('1722 verified')).toBeInTheDocument()
    expect(screen.getByText('60 / 60')).toBeInTheDocument()
    expect(screen.getByText('held on 55 maps')).toBeInTheDocument()
    expect(screen.getByText('9,443')).toBeInTheDocument()
    expect(screen.getByText('8.0')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Rex' })).toHaveAttribute('href', '/profile/76561198295368421')
    // The fixture lists 4 of the 19 partners.
    expect(screen.getByText('and 15 more')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Container Ride' })).toHaveAttribute('href', '/map/sp/62761')
  })

  it("asks for a season's stats when one is picked", async () => {
    const requests = serveProfile()
    await renderRoute(`/profile/${FIXTURE_PLAYER}`)
    await userEvent.click(await screen.findByRole('tab', { name: 'Stats' }))
    await screen.findByText('1740')
    const panel = screen.getByRole('tabpanel')
    await userEvent.selectOptions(within(panel).getByRole('combobox', { name: 'Season' }), SEASON)
    await screen.findByText('1740')
    expect(requests.asked).toContain(`/profile/stats/${FIXTURE_PLAYER}?game_id=4`)
  })

  it('says so when there are no stats', async () => {
    server.use(
      http.get(`${API}/profile/stats/:id`, () =>
        HttpResponse.json({ summary: null, unique_partners: 0, partners: [], fewest_portals: [] }),
      ),
    )
    await renderWithProviders(<StatsTab profileNumber={FIXTURE_PLAYER} game="portal2" />)
    expect(await screen.findByText('No stats for this player.')).toBeInTheDocument()
  })
})
