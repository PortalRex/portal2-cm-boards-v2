import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { formatPoints } from '@/lib/format'
import site from '@/testing/fixtures/stats-site.json'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { serveStats } from '@/testing/mocks/stats'
import { renderRoute } from '@/testing/test-utils'

const table = (name: string) => screen.getByRole('table', { name })
const playersIn = (el: HTMLElement) =>
  within(el)
    .getAllByRole('link')
    .filter((a) => a.getAttribute('href')?.startsWith('/profile/') && !a.getAttribute('href')?.includes('?'))
    .map((a) => a.textContent)

describe('Stats: Runners', () => {
  it('sorts peak points by a column header', async () => {
    serveStats()
    await renderRoute('/stats')
    await screen.findByText('10,443')
    await userEvent.click(within(table('Peak points')).getByRole('button', { name: 'Now' }))
    // Points now: unity 20261, Bexc 19495, Zypeh 19165 (peaks: Zypeh, Bexc, unity).
    expect(playersIn(table('Peak points')).slice(0, 3)).toEqual(['unity', 'Bexc', 'Zypeh'])
    await userEvent.click(within(table('Peak points')).getByRole('button', { name: 'Player' }))
    expect(playersIn(table('Peak points'))[0]).toBe(
      [...site.peaks.overall]
        .map((p) => p.user_name)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))[0],
    )
  })

  it('shows the totals, with the Runners tab marked', async () => {
    serveStats()
    await renderRoute('/stats')
    expect(await screen.findByText('10,443')).toBeInTheDocument()
    expect(screen.getByText('906 ran this year')).toBeInTheDocument()
    expect(screen.getByText('48,071 autorendered')).toBeInTheDocument()
    const tabs = screen.getByRole('navigation', { name: 'Stats pages' })
    expect(within(tabs).getByRole('link', { name: 'Runners' })).toHaveAttribute('aria-current', 'page')
    expect(within(tabs).getByRole('link', { name: 'Compare' })).toHaveAttribute('href', '/stats/compare')
  })

  it('lists peak points per board, linking each peak and its day to the profile as it was then', async () => {
    serveStats()
    const { router } = await renderRoute('/stats')
    await screen.findByText('10,443')
    const overall = site.peaks.overall[0]!
    expect(playersIn(table('Peak points'))[0]).toBe(overall.user_name)
    expect(
      within(table('Peak points')).getByText(formatPoints(overall.current - overall.points)),
    ).toBeInTheDocument()
    // The peak itself and the day it was reached.
    const [peakLink, dayLink] = within(table('Peak points')).getAllByRole('link', { name: /\d/ })
    for (const link of [peakLink, dayLink])
      expect(link).toHaveAttribute('href', `/profile/${overall.profile_number}?at=${overall.date}`)
    expect(peakLink).toHaveTextContent(formatPoints(overall.points))

    await userEvent.click(screen.getByRole('radio', { name: 'Singleplayer' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ board: 'sp' }))
    expect(playersIn(table('Peak points'))[0]).toBe(site.peaks.sp[0]!.user_name)
    await userEvent.click(screen.getByRole('radio', { name: 'Overall' }))
    await waitFor(() => expect(router.state.location.search).toEqual({}))
  })

  it('says "at peak" for a player still at their peak', async () => {
    serveStats()
    await renderRoute('/stats?board=sp')
    await screen.findByText('10,443')
    const atPeak = site.peaks.sp.filter((r) => Math.abs(r.current - r.points) < 0.05)
    expect(within(table('Peak points')).queryAllByText('at peak')).toHaveLength(atPeak.length)
  })

  it('shows the leaders, with record-days from the world record stats', async () => {
    serveStats()
    await renderRoute('/stats')
    const held = await screen.findByRole('region', { name: 'World records held' })
    expect(within(held).getAllByRole('listitem')).toHaveLength(3)
    const days = screen.getByRole('region', { name: 'Most days holding records' })
    expect(within(days).getAllByRole('listitem')[0]).toHaveTextContent('Zypeh213,441')
    // Time saved isn't ranked: a slow first PB on a quiet map would rig it.
    expect(screen.queryByRole('region', { name: 'Most time saved' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('region', { name: /^(Most|World records)/ })).toHaveLength(8)
  })

  it('lists the longest-standing records, marking co-op ones', async () => {
    serveStats()
    await renderRoute('/stats')
    await screen.findByText('10,443')
    const longest = table('Longest-standing world records')
    expect(within(longest).getByRole('link', { name: site.longest_wrs[0]!.map_name })).toHaveAttribute(
      'href',
      `/map/sp/${site.longest_wrs[0]!.map_id}`,
    )
    expect(within(longest).getByText('· co-op')).toBeInTheDocument()
  })

  it("asks for the picked game's stats", async () => {
    const asked = serveStats()
    await renderRoute('/stats?game=mel')
    await screen.findByText('10,443')
    expect(asked).toContain('/stats/site?game_id=2')
    // Mel has no co-op board, so no co-op partners list; Portal 2 keeps it (above).
    expect(screen.getByRole('region', { name: 'Most runs' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Most co-op partners' })).not.toBeInTheDocument()
  })

  it("says so when the stats can't be loaded", async () => {
    serveStats()
    server.use(http.get(`${API}/stats/site`, () => new HttpResponse(null, { status: 500 })))
    await renderRoute('/stats')
    expect(await screen.findByText('Couldn’t load the stats.')).toBeInTheDocument()
  })
})
