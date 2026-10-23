import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderRoute, renderWithProviders } from '@/testing/test-utils'
import type { AuditEntry } from '../api/audit'
import { AdminPage } from './admin-page'

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 10,
  admin_profile: '76561198000000004',
  admin_name: 'Admin',
  via_service: false,
  action: 'run.ban',
  target_type: 'run',
  target_id: '100',
  reason: 'Spliced demo',
  details: '{"note":"x"}',
  created_at: '2026-10-17T10:00:00',
  run_id: 100,
  map_id: '47458',
  map_name: 'Portal Gun',
  game_id: 1,
  score: 2243,
  post_rank: 3,
  player: '76561198000000011',
  player_name: 'Runner',
  partner: null,
  partner_name: null,
  run_exists: true,
  run_banned: true,
  run_wr_hidden: false,
  target_name: null,
  ...over,
})

/** Serves the log from `entries`, recording each request's query. */
function serveAudit(entries: AuditEntry[] | ((q: URLSearchParams) => AuditEntry[])) {
  const queries: Record<string, string>[] = []
  server.use(
    http.get(`${API}/admin/audit`, ({ request }) => {
      const q = new URL(request.url).searchParams
      queries.push(Object.fromEntries(q))
      return HttpResponse.json(typeof entries === 'function' ? entries(q) : entries)
    }),
  )
  return queries
}

const page = (section: Parameters<typeof AdminPage>[0]['section'] = 'log') => (
  <AdminPage section={section} onSection={() => {}} />
)

beforeEach(() => {
  server.use(http.get(`${API}/admin/reports/count`, () => HttpResponse.json({ open: 3 })))
})

describe('who sees the staff panel', () => {
  it('asks visitors to sign in, and tells players (and staff viewing as one) it is for staff', async () => {
    const { unmount } = await renderWithProviders(page())
    expect(screen.getByText('Sign in with an admin account to see the admin changelog.')).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Section' })).toBeNull()
    unmount()
    for (const options of [{ user: 'player' as const }, { user: 'admin' as const, viewAsPlayer: true }]) {
      const { unmount: done } = await renderWithProviders(page(), options)
      expect(screen.getByText('Staff only.')).toBeInTheDocument()
      done()
      localStorage.clear()
    }
  })

  it('gives every staff tier the changelog and reports (with the open count), admins also games and jobs', async () => {
    serveAudit([])
    const { unmount } = await renderWithProviders(page(), { user: 'verifier' })
    const sections = screen.getByRole('radiogroup', { name: 'Section' })
    expect(
      within(sections)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Changelog', 'Reports'])
    expect(await within(sections).findByText('3')).toBeInTheDocument()
    unmount()
    await renderWithProviders(page(), { user: 'admin' })
    expect(
      within(screen.getByRole('radiogroup', { name: 'Section' }))
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Changelog', 'Reports', 'Games', 'Jobs'])
  })

  it('shows the changelog when asked for an admin-only section without being an admin', async () => {
    serveAudit([])
    await renderWithProviders(page('games'), { user: 'moderator' })
    expect(screen.getByRole('heading', { name: 'Admin changelog' })).toBeInTheDocument()
  })

  it('opens a section from the address (?section=)', async () => {
    serveAudit([])
    await renderRoute('/admin?section=jobs', { user: 'admin' })
    expect(await screen.findByRole('heading', { name: 'Background jobs' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Jobs' })).toBeChecked()
  })
})

describe('the admin changelog', () => {
  it('lists run actions with the run, who did it and why', async () => {
    serveAudit([
      entry(),
      entry({
        id: 9,
        action: 'run.verify',
        via_service: true,
        admin_profile: null,
        admin_name: null,
        reason: null,
        details: '{}',
      }),
      entry({
        id: 8,
        action: 'report.new',
        run_exists: false,
        partner: '76561198000000012',
        partner_name: 'Partner',
      }),
    ])
    await renderWithProviders(page(), { user: 'verifier' })
    const rows = await screen.findAllByRole('row')
    expect(rows).toHaveLength(4)
    const first = within(rows[1]!)
    expect(first.getByText('Banned run')).toBeInTheDocument()
    expect(first.getByRole('link', { name: 'Portal Gun' })).toHaveAttribute('href', '/map/sp/47458')
    expect(first.getByRole('link', { name: 'Runner' })).toBeInTheDocument()
    expect(first.getByText('22.43')).toBeInTheDocument()
    expect(first.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/profile/76561198000000004')
    expect(first.getByText('Spliced demo')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('Board service')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('—')).toBeInTheDocument()
    expect(within(rows[2]!).queryByRole('button', { name: 'Details' })).toBeNull()
    const gone = within(rows[3]!)
    expect(gone.getByText('Player report')).toBeInTheDocument()
    expect(gone.getByText(/run deleted/)).toBeInTheDocument()
    expect(gone.queryByRole('link', { name: 'Portal Gun' })).toBeNull()
    expect(gone.getByRole('link', { name: 'Partner' })).toBeInTheDocument()
  })

  it('shows an entry’s details on demand', async () => {
    serveAudit([entry()])
    await renderWithProviders(page(), { user: 'verifier' })
    await userEvent.click(await screen.findByRole('button', { name: 'Details' }))
    expect(screen.getByText(/"note": "x"/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(screen.queryByText(/"note": "x"/)).toBeNull()
  })

  it('switches between runs, profiles and games, and filters by action', async () => {
    const queries = serveAudit((q) =>
      q.get('kind') === 'profiles'
        ? [
            entry({
              action: 'profile.set_role',
              target_type: 'profile',
              target_id: '76561198000000011',
              target_name: 'Runner',
              details: '{"before":null,"role":"verifier"}',
            }),
          ]
        : q.get('kind') === 'catalog'
          ? [
              entry({
                action: 'map.update',
                target_type: 'map',
                target_id: '47458',
                details: '{"name":"Portal Gun"}',
              }),
            ]
          : [],
    )
    await renderWithProviders(page(), { user: 'admin' })
    expect(await screen.findByText('No admin actions yet.')).toBeInTheDocument()
    const log = screen.getByRole('radiogroup', { name: 'Log' })
    await userEvent.click(within(log).getByRole('radio', { name: 'Profiles' }))
    expect(await screen.findByText('none → Verifier')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Runner' })).toHaveAttribute('href', '/profile/76561198000000011')
    await userEvent.click(within(log).getByRole('radio', { name: 'Games' }))
    expect(await screen.findByRole('button', { name: 'map Portal Gun' })).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Action' }), 'map.delete')
    await waitFor(() => expect(queries.at(-1)).toMatchObject({ kind: 'catalog', action: 'map.delete' }))
    expect(queries.map((q) => q.kind)).toEqual(['runs', 'profiles', 'catalog', 'catalog'])
    expect(queries[0]).toEqual({ kind: 'runs', limit: '50' })
  })

  it('searches the whole log on the server, with the tab and action filters', async () => {
    const queries = serveAudit((q) =>
      q.get('q') === 'wall button' && !q.get('action')
        ? [entry({ id: 7, map_id: '47804', map_name: 'Wall Button' })]
        : [],
    )
    await renderWithProviders(page(), { user: 'verifier' })
    expect(await screen.findByText('No admin actions yet.')).toBeInTheDocument()
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search the admin changelog' }),
      '  wall button ',
    )
    expect(await screen.findByRole('link', { name: 'Wall Button' })).toBeInTheDocument()
    // Asked once typing paused, trimmed, not for every key.
    expect(queries.filter((q) => q.q)).toEqual([{ kind: 'runs', q: 'wall button', limit: '50' }])
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Action' }), 'run.verify')
    await waitFor(() =>
      expect(queries.at(-1)).toEqual({ kind: 'runs', action: 'run.verify', q: 'wall button', limit: '50' }),
    )
    expect(await screen.findByText('No admin actions match.')).toBeInTheDocument()
  })

  it('pages through search results like the full log', async () => {
    const queries = serveAudit((q) => {
      const before = Number(q.get('before') ?? 1000)
      return Array.from({ length: before === 1000 ? 50 : 2 }, (_, i) => entry({ id: before - 1 - i }))
    })
    await renderWithProviders(page(), { user: 'verifier' })
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search the admin changelog' }), 'runner')
    await waitFor(() => expect(queries.at(-1)).toMatchObject({ q: 'runner' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }))
    await waitFor(() =>
      expect(queries.at(-1)).toEqual({ kind: 'runs', q: 'runner', before: '950', limit: '50' }),
    )
  })

  it('loads older entries 50 at a time', async () => {
    const queries = serveAudit((q) => {
      const before = Number(q.get('before') ?? 1000)
      const count = before === 1000 ? 50 : 3
      return Array.from({ length: count }, (_, i) => entry({ id: before - 1 - i }))
    })
    await renderWithProviders(page(), { user: 'verifier' })
    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(54))
    expect(queries[1]).toMatchObject({ before: '950' })
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  it('undoes a ban while the run is still banned, logged with a reason', async () => {
    let banned = true
    const sent: unknown[] = []
    serveAudit(() => [
      entry({ run_banned: banned }),
      entry({ id: 5, action: 'run.hide_wr', run_wr_hidden: false }),
    ])
    server.use(
      http.put(`${API}/admin/runs/100/banned`, async ({ request }) => {
        sent.push(await request.json())
        banned = false
        return new HttpResponse(null, { status: 200 })
      }),
    )
    await renderWithProviders(page(), { user: 'moderator' })
    // Already back in the WR history: nothing to undo.
    expect(await screen.findByText('Undone')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Unban' }))
    await waitFor(() => expect(screen.getAllByText('Undone')).toHaveLength(2))
    expect(sent).toEqual([{ banned: false, reason: 'Undo of #10' }])
  })

  it('says when the log can’t be loaded', async () => {
    server.use(http.get(`${API}/admin/audit`, () => new HttpResponse('Not allowed.', { status: 403 })))
    await renderWithProviders(page(), { user: 'verifier' })
    expect(await screen.findByText('Couldn’t load the admin changelog: Not allowed.')).toBeInTheDocument()
  })
})
