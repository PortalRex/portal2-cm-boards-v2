import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { users } from '@/testing/data/users'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderRoute, renderWithProviders } from '@/testing/test-utils'
import type { AuditEntry } from '../api/audit'
import type { StaffInboxData } from '../api/inbox'
import { StaffInbox } from './staff-inbox'

const entry = (over: Partial<AuditEntry>): AuditEntry => ({
  id: 1,
  admin_profile: users.admin.profile_number,
  admin_name: 'Admin',
  via_service: false,
  action: 'run.ban',
  target_type: 'run',
  target_id: '100',
  reason: null,
  details: null,
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

const inbox = (over: Partial<StaffInboxData> = {}): StaffInboxData => ({
  items: [
    entry({ id: 12, action: 'report.new', reason: 'Spliced', admin_profile: null, admin_name: null }),
    entry({
      id: 11,
      action: 'profile.ban',
      target_type: 'profile',
      target_id: '76561198000000011',
      target_name: 'Runner',
      run_id: null,
      map_id: null,
    }),
    entry({ id: 10, admin_profile: users.moderator.profile_number, admin_name: 'Moderator' }),
    entry({ id: 9, via_service: true, admin_profile: null, admin_name: null, action: 'run.verify' }),
  ],
  unread: 3,
  seen_id: 8,
  open_reports: 2,
  ...over,
})

describe('the staff inbox', () => {
  it('counts new entries and open reports on the button', async () => {
    server.use(http.get(`${API}/admin/inbox`, () => HttpResponse.json(inbox())))
    await renderWithProviders(<StaffInbox />, { user: 'moderator' })
    expect(await screen.findByRole('button', { name: 'Staff inbox, 3 new, 2 open reports' })).toHaveAttribute(
      'title',
      'Staff inbox · 2 open reports',
    )
  })

  it('opens the entries, marks them read and highlights the new ones (not your own)', async () => {
    const seen: unknown[] = []
    server.use(
      http.get(`${API}/admin/inbox`, () => HttpResponse.json(inbox())),
      http.put(`${API}/admin/inbox/seen`, async ({ request }) => {
        seen.push(await request.json())
        return new HttpResponse(null, { status: 200 })
      }),
    )
    await renderWithProviders(<StaffInbox />, { user: 'moderator' })
    await userEvent.click(await screen.findByRole('button', { name: /Staff inbox, 3 new/ }))
    const panel = within(screen.getByRole('dialog', { name: 'Staff inbox' }))
    expect(screen.getByRole('button', { name: 'Staff inbox, 2 open reports' })).toBeInTheDocument()
    await waitFor(() => expect(seen).toEqual([{ id: 12 }]))
    expect(panel.getByRole('link', { name: /2\s*open reports to review/ })).toHaveAttribute(
      'href',
      '/admin?section=reports',
    )
    const links = panel.getAllByRole('link').slice(2)
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/admin?section=reports',
      '/profile/76561198000000011',
      '/run/100',
      '/run/100',
    ])
    expect(links[0]).toHaveTextContent('New report Portal Gun')
    expect(links[0]).toHaveTextContent('“Spliced”')
    expect(links[0]).toHaveTextContent('Player report ·')
    expect(links[2]).toHaveTextContent('Runner · 22.43')
    expect(links[3]).toHaveTextContent('Board service ·')
    const items = panel.getAllByRole('listitem')
    // New since entry 8, except the moderator's own entry 10.
    expect(items.map((li) => li.hasAttribute('data-new'))).toEqual([true, true, false, true])
  })

  it('closes on Escape and on a click outside', async () => {
    await renderWithProviders(<StaffInbox />, { user: 'verifier' })
    const button = await screen.findByRole('button', { name: 'Staff inbox' })
    await userEvent.click(button)
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.click(button)
    await userEvent.click(document.body)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('updates live: waits for the next entry, loads the inbox and waits again', async () => {
    let state = inbox({ items: [entry({ id: 5 })], unread: 0, seen_id: 5, open_reports: 0 })
    const waits: Record<string, string>[] = []
    server.use(
      http.get(`${API}/admin/inbox`, () => HttpResponse.json(state)),
      http.get(`${API}/admin/inbox/wait`, async ({ request }) => {
        waits.push(Object.fromEntries(new URL(request.url).searchParams))
        if (waits.length === 1) {
          state = inbox({
            items: [entry({ id: 6, admin_profile: users.admin.profile_number }), entry({ id: 5 })],
            unread: 1,
            seen_id: 5,
            open_reports: 0,
          })
          return HttpResponse.json({ changed: true })
        }
        await delay('infinite')
        return new HttpResponse(null, { status: 204 })
      }),
    )
    await renderWithProviders(<StaffInbox />, { user: 'moderator' })
    expect(await screen.findByRole('button', { name: 'Staff inbox, 1 new' })).toBeInTheDocument()
    await waitFor(() => expect(waits).toHaveLength(2))
    expect(waits).toEqual([
      { after: '5', seen: '5' },
      { after: '6', seen: '5' },
    ])
  })

  it('stops waiting when it goes away', async () => {
    let signal: AbortSignal | undefined
    server.use(
      http.get(`${API}/admin/inbox/wait`, async ({ request }) => {
        signal = request.signal
        await delay('infinite')
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { unmount } = await renderWithProviders(<StaffInbox />, { user: 'moderator' })
    await waitFor(() => expect(signal).toBeDefined())
    unmount()
    expect(signal!.aborted).toBe(true)
  })

  it('is in the top bar for staff only', async () => {
    const { unmount } = await renderRoute('/more/about', { user: 'player' })
    await screen.findByRole('heading', { name: 'Portal 2 Challenge Mode Leaderboards' })
    expect(screen.queryByRole('button', { name: /Staff inbox/ })).toBeNull()
    unmount()
    await renderRoute('/more/about', { user: 'verifier' })
    expect(await screen.findByRole('button', { name: 'Staff inbox' })).toBeInTheDocument()
  })
})
