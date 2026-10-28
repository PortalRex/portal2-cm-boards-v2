import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import changelog from '@/testing/fixtures/profile-changelog.json'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { parseTimestamp } from '@/lib/format'
import { renderWithProviders } from '@/testing/test-utils'
import type { ChangelogRaw } from '@/types/runs'
import { TimeButton } from './time-button'

const map = { id: '47804', title: 'Wall Button', mode: 'sp', game: 'portal2', chapter: 'The Itch' }
const player = { profileNumber: '76561198000000099', name: 'Bexc', avatar: null }
const base = (changelog as ChangelogRaw[])[0]!
const row = (id: number, score: number, banned: boolean): ChangelogRaw => ({
  ...base,
  id,
  score,
  banned,
  map_id: map.id,
  map_name: map.title,
  profile_number: player.profileNumber,
  coop_id: null,
})

/** Serves the player's history on the map, and records ban / unban requests. */
function serveHistory(rows: ChangelogRaw[]) {
  const sent: { id: string; body: unknown }[] = []
  server.use(
    http.get(`${API}/changelog`, () => HttpResponse.json(rows)),
    http.put(`${API}/admin/runs/:id/banned`, async ({ params, request }) => {
      sent.push({ id: String(params.id), body: await request.json() })
      return new HttpResponse(null, { status: 200 })
    }),
  )
  return sent
}

const openHistory = async () => {
  await userEvent.click(screen.getByTitle("Bexc's history on Wall Button"))
  return screen.findByRole('dialog')
}

describe('run history dialog', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lets staff ban and unban runs from the list', async () => {
    const sent = serveHistory([row(501, 3711, false), row(502, 3448, true)])
    await renderWithProviders(<TimeButton score={3711} players={[player]} map={map} />, { user: 'verifier' })
    const dialog = await openHistory()
    const [ban, unban] = [
      await within(dialog).findByRole('button', { name: 'Ban run' }),
      within(dialog).getByRole('button', { name: 'Unban run' }),
    ]
    expect(unban).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(ban)
    await userEvent.click(unban)
    expect(sent).toEqual([
      { id: '501', body: { banned: true } },
      { id: '502', body: { banned: false } },
    ])
  })

  it('says so when a ban fails', async () => {
    serveHistory([row(501, 3711, false)])
    server.use(
      http.put(`${API}/admin/runs/:id/banned`, () => new HttpResponse('No such run.', { status: 404 })),
    )
    await renderWithProviders(<TimeButton score={3711} players={[player]} map={map} />, { user: 'verifier' })
    const dialog = await openHistory()
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Ban run' }))
    expect(await within(dialog).findByTitle("Couldn't ban this run: No such run.")).toBeInTheDocument()
  })

  it('shows players no ban switch', async () => {
    serveHistory([row(501, 3711, false)])
    await renderWithProviders(<TimeButton score={3711} players={[player]} map={map} />, { user: 'player' })
    const dialog = await openHistory()
    expect(await within(dialog).findByText('37.11')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /ban run/i })).not.toBeInTheDocument()
  })

  it("shows each co-op run's partner, unknown when no one is on record", async () => {
    const doors = { id: '47741', title: 'Doors', mode: 'coop', game: 'portal2', chapter: 'Team Building' }
    const coop = (id: number, partner: { pn: string; name: string } | null): ChangelogRaw => ({
      ...row(id, 2000, false),
      map_id: doors.id,
      map_name: doors.title,
      coop_id: partner ? id : null,
      blue_profile_number: partner ? player.profileNumber : null,
      blue_name: partner ? player.name : null,
      blue_avatar: null,
      orange_profile_number: partner?.pn ?? null,
      orange_name: partner?.name ?? null,
      orange_avatar: null,
    })
    serveHistory([coop(601, { pn: '76561198000000042', name: 'Nate' }), coop(602, null)])
    await renderWithProviders(<TimeButton score={2000} players={[player]} map={doors} />)
    await userEvent.click(screen.getByTitle("Bexc's history on Doors"))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByRole('columnheader', { name: 'Partner' })).toBeInTheDocument()
    const [first, second] = within(dialog).getAllByRole('row').slice(1)
    expect(within(first!).getByRole('link', { name: 'Nate' })).toHaveAttribute(
      'href',
      '/profile/76561198000000042',
    )
    expect(within(second!).getByText('Unknown partner')).toBeInTheDocument()
  })

  // Newest first, as the server sends them; the banned run isn't charted.
  const dated = (id: number, score: number, timestamp: string, banned = false) => ({
    ...row(id, score, banned),
    timestamp,
  })
  const datedRuns = [
    dated(503, 3448, '2026-03-01T12:00:00'),
    dated(504, 3400, '2026-02-01T12:00:00', true),
    dated(502, 3600, '2025-06-01T12:00:00'),
    dated(501, 3711, '2024-01-01T12:00:00'),
  ]
  const pickedRow = (dialog: HTMLElement) =>
    within(dialog)
      .getAllByRole('row')
      .find((r) => r.getAttribute('aria-current'))

  it('charts the runs, and the arrow keys pick them in the list', async () => {
    serveHistory(datedRuns)
    await renderWithProviders(<TimeButton score={3448} players={[player]} map={map} />)
    const dialog = await openHistory()
    const chart = await within(dialog).findByRole('generic', { name: /Bexc's time history/ })
    expect(within(dialog).getByText('3 runs')).toBeInTheDocument()

    expect(pickedRow(dialog)).toBeUndefined()
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    expect(within(pickedRow(dialog)!).getByText('34.48')).toBeInTheDocument()
    // Past the banned run, to the one before.
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    expect(within(pickedRow(dialog)!).getByText('36.00')).toBeInTheDocument()
    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    // Right of the latest run is today: nothing picked.
    expect(pickedRow(dialog)).toBeUndefined()
  })

  it('picks the run clicked on the chart', async () => {
    // 1056px wide: the 56px time axis, 988px of chart and 12px to its right.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 1056, height: 170 }),
    )
    serveHistory(datedRuns)
    await renderWithProviders(<TimeButton score={3448} players={[player]} map={map} />)
    const dialog = await openHistory()
    const chart = await within(dialog).findByRole('generic', { name: /Bexc's time history/ })
    // The chart runs from the first run to today.
    const [from, to] = [parseTimestamp('2024-01-01T12:00:00').getTime(), Date.now()]
    const xOf = (timestamp: string) => 56 + ((parseTimestamp(timestamp).getTime() - from) / (to - from)) * 988

    fireEvent.click(chart, { clientX: xOf('2025-06-01T12:00:00') + 2 })
    expect(within(pickedRow(dialog)!).getByText('36.00')).toBeInTheDocument()
    // On the time axis' labels: nothing.
    fireEvent.click(chart, { clientX: 20 })
    expect(within(pickedRow(dialog)!).getByText('36.00')).toBeInTheDocument()
  })

  it('has no partner column on a single player map', async () => {
    serveHistory([row(501, 3711, false)])
    await renderWithProviders(<TimeButton score={3711} players={[player]} map={map} />)
    const dialog = await openHistory()
    await within(dialog).findByText('37.11')
    expect(within(dialog).queryByRole('columnheader', { name: 'Partner' })).toBeNull()
  })
})
