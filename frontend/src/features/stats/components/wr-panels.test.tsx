import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { formatLongScore, formatScore } from '@/lib/format'
import wr from '@/testing/fixtures/stats-wr.json'
import { serveStats } from '@/testing/mocks/stats'
import { renderRoute } from '@/testing/test-utils'

const table = (name: string) => screen.getByRole('table', { name })
const rowsOf = (name: string) => within(table(name)).getAllByRole('row').slice(1)

describe('Stats: Records', () => {
  it("lists the mode's current records with their totals", async () => {
    serveStats()
    await renderRoute('/stats/records')
    expect(await screen.findByText(formatLongScore(wr.total_time.sp))).toBeInTheDocument()
    expect(screen.getByText(formatLongScore(wr.total_time.coop))).toBeInTheDocument()
    // The oldest record of all, in days.
    expect(screen.getByText('1,458 days')).toBeInTheDocument()
    expect(rowsOf('World records').map((r) => within(r).getAllByRole('link')[0]!.textContent)).toEqual([
      'Container Ride',
      'Portal Carousel',
      'Portal Gun',
    ])
    expect(screen.getByRole('link', { name: 'Records' })).toHaveAttribute('aria-current', 'page')
  })

  it('orders the records by how long they have stood, either way', async () => {
    serveStats()
    await renderRoute('/stats/records')
    const maps = () => rowsOf('World records').map((r) => within(r).getAllByRole('link')[0]!.textContent)
    await userEvent.click(await screen.findByRole('radio', { name: 'Shortest standing' }))
    // Portal Gun 128 days, Portal Carousel 190, Container Ride 341.
    expect(maps()).toEqual(['Portal Gun', 'Portal Carousel', 'Container Ride'])
    await userEvent.click(screen.getByRole('radio', { name: 'Longest standing' }))
    expect(maps()).toEqual(['Container Ride', 'Portal Carousel', 'Portal Gun'])
    await userEvent.click(screen.getByRole('radio', { name: 'Map order' }))
    expect(maps()).toEqual(['Container Ride', 'Portal Carousel', 'Portal Gun'])
  })

  it('switches mode in the address', async () => {
    serveStats()
    const { router } = await renderRoute('/stats/records')
    await userEvent.click(await screen.findByRole('radio', { name: 'Cooperative' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ mode: 'coop' }))
    expect(rowsOf('World records')).toHaveLength(3)
    expect(within(table('World records')).getByRole('link', { name: 'Doors' })).toBeInTheDocument()
  })

  it('ranks the players holding records now', async () => {
    serveStats()
    await renderRoute('/stats/records')
    const held = await screen.findByRole('list', { name: 'Records held now' })
    expect(
      within(held)
        .getAllByRole('listitem')
        .map((li) => within(li).getByRole('link').textContent),
    ).toEqual(['RealCreative', 'unity', 'Betsruner'])
  })
})

describe('Stats: History', () => {
  it('opens on the longest-lasting records, marking those still standing', async () => {
    serveStats()
    await renderRoute('/stats/history')
    expect(await screen.findByRole('table', { name: 'Longest lasting records' })).toBeInTheDocument()
    expect(rowsOf('Longest lasting records')).toHaveLength(3)
    expect(within(table('Longest lasting records')).getAllByText('still standing')).toHaveLength(2)
  })

  it.each([
    ['Longest domination', 'domination', 'Turret Ninja'],
    ['Biggest improvements', 'improvements', 'Cave Johnson'],
    ['Days holding', 'days', 'Zypeh'],
  ])('shows %s (?view=%s)', async (label, view, first) => {
    serveStats()
    const { router } = await renderRoute('/stats/history')
    await userEvent.click(await screen.findByRole('radio', { name: label }))
    await waitFor(() => expect(router.state.location.search).toEqual({ view }))
    expect(within(table(label)).getByRole('link', { name: first })).toBeInTheDocument()
  })

  it('shows how much each improvement took off', async () => {
    serveStats()
    await renderRoute('/stats/history?view=improvements')
    expect(await screen.findByText(`−${formatScore(1765)}`)).toBeInTheDocument()
  })
})

describe('Stats: Race', () => {
  it('starts on the latest month and steps through the months', async () => {
    serveStats()
    await renderRoute('/stats/race')
    expect(await screen.findByText('Oct 2026')).toBeInTheDocument()
    const shown = () =>
      screen.getAllByTestId('race-row').filter((r) => r.getAttribute('aria-hidden') !== 'true')
    expect(shown()).toHaveLength(wr.race.overall.frames[2]!.top.length)
    fireEvent.change(screen.getByRole('slider', { name: 'Month' }), { target: { value: '0' } })
    // The first frame's month, in the page's own format ("Sep" or "Sept" depending on ICU).
    const first = new Date(wr.race.overall.frames[0]!.date).toLocaleDateString('en-GB', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
    expect(screen.getByText(first)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  it('switches board in the address', async () => {
    serveStats()
    const { router } = await renderRoute('/stats/race')
    await userEvent.click(await screen.findByRole('radio', { name: 'Singleplayer' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ board: 'sp' }))
  })
})
