import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import changelog from '@/testing/fixtures/changelog.json'
import coopHalves from '@/testing/fixtures/coop-halves.json'
import { users } from '@/testing/data/users'
import { API, AUTORENDER } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderWithProviders } from '@/testing/test-utils'
import { timerNote } from '../utils/timer-note'
import { RunDetails, type DetailsRun } from './run-details'

const map = { id: '47741', title: 'Doors', mode: 'coop', game: 'portal2', chapter: 'Team Building' }

const spRun: DetailsRun = {
  id: 100,
  score: 2001,
  postRank: 3,
  timestamp: '2026-10-13T19:03:55',
  players: [{ profileNumber: '76561198000000001', name: 'Runner', avatar: null }],
  demoId: 55,
  youtubeId: 'abc123?start=4',
  note: 'gg',
  portals: 4,
  sarVersion: '1.12.8',
  verified: true,
}

const noSegments = () => server.use(http.get(`${API}/changelog/:id/segments`, () => HttpResponse.json([])))

describe('RunDetails', () => {
  it('shows the comment, players, time and rank, date, SAR version, portals and status', async () => {
    noSegments()
    await renderWithProviders(<RunDetails run={spRun} map={map} />)
    expect(screen.getByText('gg')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Runner' })).toHaveAttribute('href', '/profile/76561198000000001')
    expect(screen.getByText('20.01 · rank 3')).toBeInTheDocument()
    expect(screen.getByText('Tue, 2026-10-13, 19:03:55')).toBeInTheDocument()
    expect(screen.getByText('1.12.8')).toBeInTheDocument()
    expect(screen.getByText('Verified')).toBeInTheDocument()
    expect(screen.getByText('Portals:').nextSibling).toHaveTextContent('4')
  })

  it('marks estimated dates and pending or banned runs', async () => {
    noSegments()
    const { unmount } = await renderWithProviders(
      <RunDetails run={{ ...spRun, dateEstimated: true, verified: false, note: null }} map={map} />,
    )
    expect(screen.getByText(/About 2026-10-13/)).toHaveTextContent('(estimated)')
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('No comment')).toBeInTheDocument()
    unmount()
    await renderWithProviders(<RunDetails run={{ ...spRun, banned: true }} map={map} />)
    expect(screen.getByText('Banned')).toBeInTheDocument()
  })

  it('links the demo, YouTube and an autorender request', async () => {
    noSegments()
    await renderWithProviders(<RunDetails run={spRun} map={map} />)
    expect(screen.getByRole('link', { name: /download demo/i })).toHaveAttribute(
      'href',
      'http://localhost:3000/api/v1/demos/55/file',
    )
    expect(screen.getByRole('link', { name: /youtube/i })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=abc123',
    )
    expect(screen.getByRole('link', { name: /request render/i })).toHaveAttribute(
      'href',
      `${AUTORENDER}/render/portal2/100`,
    )
  })

  it('leaves out what a run without demo or video lacks', async () => {
    noSegments()
    await renderWithProviders(<RunDetails run={{ ...spRun, demoId: null, youtubeId: null }} map={map} />)
    expect(screen.getByText('No video')).toBeInTheDocument()
    // No dimmed buttons that look available: no demo to download, no video, nothing to render from.
    expect(screen.queryByText(/download demo/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^youtube/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/request render/i)).not.toBeInTheDocument()
  })

  it('shows just the buttons the run has', async () => {
    noSegments()
    await renderWithProviders(<RunDetails run={{ ...spRun, youtubeId: null }} map={map} />)
    expect(screen.getByRole('link', { name: /download demo/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /request render/i })).toBeInTheDocument()
    expect(screen.queryByText(/^youtube/i)).not.toBeInTheDocument()
  })

  it('says the rank a board row had when it was set, when that differs from its rank now', async () => {
    noSegments()
    // GET /changelog/100: the run as it was logged, 2nd when set.
    const asSet = (post_rank: number) =>
      server.use(
        http.get(`${API}/changelog/:id`, () => HttpResponse.json({ ...changelog[0], id: 100, post_rank })),
      )
    const fromBoard = { ...spRun, postRank: undefined, rank: 3 }
    asSet(2)
    const { unmount } = await renderWithProviders(<RunDetails run={fromBoard} map={map} />)
    expect(await screen.findByText(/2nd when set/)).toBeInTheDocument()
    expect(screen.getByText(/rank 3/)).toBeInTheDocument()
    unmount()
    // Still 3rd: nothing extra.
    asSet(3)
    await renderWithProviders(<RunDetails run={fromBoard} map={map} />)
    await waitFor(() => expect(screen.getByText(/rank 3/)).toBeInTheDocument())
    expect(screen.queryByText(/when set/)).not.toBeInTheDocument()
  })

  it('shows the mtrigger segments with running totals, and the timer note when the demo is 0.01 off', async () => {
    server.use(
      http.get(`${API}/changelog/100/segments`, () =>
        HttpResponse.json([
          { name: 'Doors - Start', ticks: 600 },
          { name: 'Doors - Exit', ticks: 601 },
        ]),
      ),
    )
    // 1201 ticks are 20.01 on the demo; the game showed 20.00.
    await renderWithProviders(<RunDetails run={{ ...spRun, score: 2000 }} map={map} />)
    const table = await screen.findByRole('table')
    expect(
      within(table)
        .getAllByRole('row')
        .map((r) => r.textContent),
    ).toEqual(['SegmentTimeTicksTotalTotal ticks', 'Start10.00060010.000600', 'Exit10.01760120.0171201'])
    expect(screen.getByText(/Timer rounding/)).toHaveTextContent(
      'Timer rounding: the demo’s 1201 ticks are 20.01; the game showed 20.00.',
    )
  })

  it('explains when there are no segments', async () => {
    noSegments()
    await renderWithProviders(<RunDetails run={spRun} map={map} />)
    expect(await screen.findByText(/No mtrigger data for this run/)).toBeInTheDocument()
  })

  it("switches between a co-op run's halves, each with its own comment and demo", async () => {
    noSegments()
    server.use(http.get(`${API}/coop/7/halves`, () => HttpResponse.json(coopHalves)))
    const [first, second] = coopHalves
    const run: DetailsRun = { ...spRun, id: second!.changelog_id!, coopId: 7, note: 'run note' }
    await renderWithProviders(<RunDetails run={run} map={map} />)
    // Opens on the half the row is.
    const tabs = await screen.findAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual([first!.user_name, second!.user_name])
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(tabs[0]!)
    await waitFor(() => expect(tabs[0]).toHaveAttribute('aria-selected', 'true'))
    expect(screen.getByRole('link', { name: /download demo/i })).toHaveAttribute(
      'href',
      `http://localhost:3000/api/v1/demos/${first!.demo_id}/file`,
    )
  })

  it('shows the demo of a partner the run wasn’t a personal best for, and offers them to add theirs', async () => {
    noSegments()
    const [first, second] = coopHalves
    const run: DetailsRun = { ...spRun, id: first!.changelog_id!, coopId: 7 }
    // Without their demo the partner's tab is off; signed in as them, they can add it.
    server.use(
      http.get(`${API}/coop/7/halves`, () =>
        HttpResponse.json([first, { ...second, profile_number: users.player.profile_number }]),
      ),
    )
    const { unmount } = await renderWithProviders(<RunDetails run={run} map={map} />, { user: 'player' })
    expect((await screen.findAllByRole('tab'))[1]).toBeDisabled()
    expect(screen.getByText('Add your demo')).toBeInTheDocument()
    unmount()

    // With it, their tab shows their demo (no video or comment of their own).
    server.use(http.get(`${API}/coop/7/halves`, () => HttpResponse.json([first, { ...second, demo_id: 61 }])))
    await renderWithProviders(<RunDetails run={{ ...run, note: 'run note' }} map={map} />)
    const tab = (await screen.findAllByRole('tab'))[1]!
    expect(tab).toBeEnabled()
    await userEvent.click(tab)
    await waitFor(() => expect(tab).toHaveAttribute('aria-selected', 'true'))
    expect(screen.getByRole('link', { name: /download demo/i })).toHaveAttribute(
      'href',
      'http://localhost:3000/api/v1/demos/61/file',
    )
    expect(screen.getByText('No comment')).toBeInTheDocument()
    expect(screen.queryByText('Add your demo')).toBeNull()
  })
})

describe('timerNote', () => {
  it('notes a time 0.01 under the demo, or rounded up, and nothing otherwise', () => {
    expect(timerNote(2000, 1201)).toEqual({ ticks: 1201, demo: 2001 })
    // 1202 ticks = 20.0333 -> demo 20.03; a shown 20.03 is the same.
    expect(timerNote(2003, 1202)).toBeNull()
    // 1205 ticks = 20.0833: cut down 20.08, rounded 20.08 -> the same.
    expect(timerNote(2008, 1205)).toBeNull()
    // 1204 ticks = 20.0666: cut down 20.06, rounded up 20.07.
    expect(timerNote(2007, 1204)).toEqual({ ticks: 1204, demo: 2006 })
    expect(timerNote(null, 1201)).toBeNull()
    expect(timerNote(2000, null)).toBeNull()
  })
})
