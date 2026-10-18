import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { users } from '@/testing/data/users'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderWithProviders } from '@/testing/test-utils'
import type { StaffNote } from '../api/staff'
import { RunDetails, type DetailsRun } from './run-details'

const spMap = { id: '47759', title: 'Laser Relays', mode: 'sp', game: 'portal2', chapter: 'The Return' }
const coopMap = { id: '52642', title: 'Doors', mode: 'coop', game: 'portal2', chapter: 'Team Building' }
const run: DetailsRun = { id: 100, score: 2001, players: [], verified: true, demoId: 7 }
const blue = { profileNumber: '76561198000000011', name: 'Blue', avatar: null }
const orange = { profileNumber: '76561198000000012', name: 'Orange', avatar: null }
const coopRun: DetailsRun = {
  id: 100,
  coopId: 9,
  score: 2001,
  players: [blue, orange],
  rolesKnown: true,
  verified: true,
}

/** Records the body of each request to `method path`, answering 200. */
function capture(method: 'put' | 'delete' | 'post', path: string) {
  const sent: unknown[] = []
  server.use(
    http[method](`${API}${path}`, async ({ request }) => {
      sent.push(await request.json().catch(() => null))
      return new HttpResponse(null, { status: 200 })
    }),
  )
  return sent
}

const admin = () => screen.findByText('Admin')

beforeEach(() => {
  server.use(
    http.get(`${API}/changelog/:id/segments`, () => HttpResponse.json([])),
    http.get(`${API}/coop/:id/halves`, () => HttpResponse.json([])),
  )
})

describe('who sees the staff tools', () => {
  it('is hidden from visitors, players and staff viewing the site as a player', async () => {
    for (const options of [{}, { user: 'player' as const }, { user: 'admin' as const, viewAsPlayer: true }]) {
      const { unmount } = await renderWithProviders(<RunDetails run={run} map={spMap} />, options)
      await screen.findByRole('button', { name: /report run/i })
      expect(screen.queryByText('Admin')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Ban run' })).toBeNull()
      unmount()
      localStorage.clear()
    }
  })

  it('gives verifiers and moderators ban and verify, but not demo removal or deleting', async () => {
    for (const user of ['verifier', 'moderator'] as const) {
      const { unmount } = await renderWithProviders(<RunDetails run={run} map={spMap} />, { user })
      await admin()
      expect(screen.getByRole('button', { name: 'Ban run' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Mark pending' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Remove demo' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Delete run' })).toBeNull()
      unmount()
    }
  })

  it('gives admins demo removal (when there is a demo) and deleting', async () => {
    await renderWithProviders(<RunDetails run={run} map={spMap} />, { user: 'admin' })
    await admin()
    expect(screen.getByRole('button', { name: 'Remove demo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete run' })).toBeInTheDocument()
  })

  it('offers Verify for a pending run, and only Unban for a banned one', async () => {
    const { unmount } = await renderWithProviders(
      <RunDetails run={{ ...run, verified: false }} map={spMap} />,
      {
        user: 'verifier',
      },
    )
    expect(await screen.findByRole('button', { name: 'Verify run' })).toBeInTheDocument()
    unmount()
    await renderWithProviders(<RunDetails run={{ ...run, banned: true }} map={spMap} />, { user: 'verifier' })
    expect(await screen.findByRole('button', { name: 'Unban run' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /verify run|mark pending/i })).toBeNull()
  })
})

describe('staff actions', () => {
  it('bans with the reason, says so, and refreshes the boards and the run', async () => {
    const sent = capture('put', '/admin/runs/100/banned')
    const { queryClient } = await renderWithProviders(<RunDetails run={run} map={spMap} />, {
      user: 'moderator',
    })
    queryClient.setQueryData(['map-board', '47759'], [])
    await admin()
    await userEvent.type(screen.getByRole('textbox', { name: 'Reason' }), '  spliced demo ')
    await userEvent.click(screen.getByRole('button', { name: 'Ban run' }))
    expect(await screen.findByText('Run banned.')).toBeInTheDocument()
    expect(sent).toEqual([{ banned: true, reason: 'spliced demo' }])
    expect(queryClient.getQueryState(['map-board', '47759'])?.isInvalidated).toBe(true)
  })

  it('leaves the reason out when there is none, and shows the server’s error', async () => {
    const sent: unknown[] = []
    server.use(
      http.put(`${API}/admin/runs/100/verified`, async ({ request }) => {
        sent.push(await request.json())
        return new HttpResponse('Run not found.', { status: 404 })
      }),
    )
    await renderWithProviders(<RunDetails run={run} map={spMap} />, { user: 'verifier' })
    await userEvent.click(await screen.findByRole('button', { name: 'Mark pending' }))
    expect(await screen.findByText('Run not found.')).toBeInTheDocument()
    expect(sent).toEqual([{ verified: false }])
  })

  it('deletes a run only on a second click, and a click elsewhere cancels', async () => {
    const sent = capture('delete', '/admin/runs/100')
    await renderWithProviders(<RunDetails run={run} map={spMap} />, { user: 'admin' })
    await admin()
    const del = screen.getByRole('button', { name: 'Delete run' })
    await userEvent.click(del)
    expect(del).toHaveAccessibleName('Confirm delete')
    await userEvent.click(screen.getByRole('textbox', { name: 'Reason' }))
    expect(del).toHaveAccessibleName('Delete run')
    await userEvent.click(del)
    await userEvent.click(del)
    expect(await screen.findByText('Run deleted.')).toBeInTheDocument()
    expect(sent).toEqual([{}])
  })

  it('removes the demo on a second click', async () => {
    const sent = capture('delete', '/admin/runs/100/demo')
    await renderWithProviders(<RunDetails run={run} map={spMap} />, { user: 'admin' })
    await admin()
    const remove = screen.getByRole('button', { name: 'Remove demo' })
    await userEvent.click(remove)
    await userEvent.click(screen.getByRole('button', { name: 'Confirm removal' }))
    expect(await screen.findByText('Demo removed.')).toBeInTheDocument()
    expect(sent).toEqual([{}])
  })
})

describe('co-op runs', () => {
  it('sets the partner by SteamID on Portal 2, but not on Mel', async () => {
    const sent = capture('put', '/admin/runs/100/partner')
    const { unmount } = await renderWithProviders(<RunDetails run={coopRun} map={coopMap} />, {
      user: 'moderator',
    })
    await admin()
    const set = screen.getByRole('button', { name: 'Set partner' })
    expect(set).toBeDisabled()
    await userEvent.type(screen.getByRole('textbox', { name: 'Partner SteamID64' }), '76561198000000099')
    await userEvent.click(set)
    expect(await screen.findByText('Partner set.')).toBeInTheDocument()
    expect(sent).toEqual([{ steam_id: '76561198000000099' }])
    unmount()
    await renderWithProviders(<RunDetails run={coopRun} map={coopMap} game="mel" />, { user: 'moderator' })
    await admin()
    expect(screen.queryByRole('button', { name: 'Set partner' })).toBeNull()
  })

  it('records who hosted, and the colours follow straight away', async () => {
    const sent = capture('put', '/coop/9/host')
    await renderWithProviders(<RunDetails run={coopRun} map={coopMap} />, { user: 'verifier' })
    const group = await screen.findByRole('radiogroup', { name: 'Blue (host)' })
    expect(within(group).getByRole('radio', { name: 'Blue' })).toBeChecked()
    await userEvent.click(within(group).getByRole('radio', { name: 'Orange' }))
    await waitFor(() => expect(within(group).getByRole('radio', { name: 'Orange' })).toBeChecked())
    await userEvent.click(within(group).getByRole('radio', { name: 'Unknown' }))
    await waitFor(() => expect(within(group).getByRole('radio', { name: 'Unknown' })).toBeChecked())
    expect(sent).toEqual([{ host: orange.profileNumber }, { host: null }])
  })
})

describe('who reacted', () => {
  it('loads the record when opened: current reactions and the history', async () => {
    server.use(
      http.get(`${API}/admin/runs/100/reactions`, () =>
        HttpResponse.json({
          current: [
            {
              profile_number: blue.profileNumber,
              user_name: 'Blue',
              avatar: null,
              reaction: 1,
              created_at: '2026-10-01T12:00:00Z',
            },
          ],
          history: [
            {
              profile_number: blue.profileNumber,
              user_name: 'Blue',
              avatar: null,
              reaction: -1,
              created_at: '2026-09-30T12:00:00Z',
            },
            {
              profile_number: blue.profileNumber,
              user_name: 'Blue',
              avatar: null,
              reaction: null,
              created_at: '2026-09-30T13:00:00Z',
            },
          ],
        }),
      ),
    )
    await renderWithProviders(<RunDetails run={run} map={spMap} />, { user: 'verifier' })
    await userEvent.click(await screen.findByRole('button', { name: 'Reactions' }))
    expect(await screen.findByText('👍')).toBeInTheDocument()
    expect(screen.getByText('History (2)')).toBeInTheDocument()
    expect(screen.getByText('cleared')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Hide reactions' }))
    expect(screen.queryByText('👍')).toBeNull()
  })

  it('says when nobody reacted, and when the record can’t load', async () => {
    const { unmount } = await renderWithProviders(<RunDetails run={run} map={spMap} />, { user: 'verifier' })
    await userEvent.click(await screen.findByRole('button', { name: 'Reactions' }))
    expect(await screen.findByText('No reactions yet.')).toBeInTheDocument()
    unmount()
    server.use(http.get(`${API}/admin/runs/100/reactions`, () => new HttpResponse(null, { status: 500 })))
    await renderWithProviders(<RunDetails run={run} map={spMap} />, { user: 'verifier' })
    await userEvent.click(await screen.findByRole('button', { name: 'Reactions' }))
    expect(await screen.findByText('Couldn’t load reactions.')).toBeInTheDocument()
  })
})

describe('staff notes', () => {
  const notes: StaffNote[] = [
    {
      id: null,
      author: null,
      author_name: null,
      avatar: null,
      body: 'Imported from the old board.',
      created_at: null,
    },
    {
      id: 1,
      author: users.verifier.profile_number,
      author_name: 'Verifier',
      avatar: null,
      body: 'Checked the demo.',
      created_at: '2026-10-01T12:00:00',
    },
    {
      id: 2,
      author: users.moderator.profile_number,
      author_name: 'Moderator',
      avatar: null,
      body: 'Agreed.',
      created_at: '2026-10-02T12:00:00',
    },
  ]

  it('lists notes; staff can delete their own, admins any', async () => {
    server.use(http.get(`${API}/admin/runs/100/notes`, () => HttpResponse.json(notes)))
    const { unmount } = await renderWithProviders(<RunDetails run={run} map={spMap} />, { user: 'verifier' })
    expect(await screen.findByText('Staff notes (3)')).toBeInTheDocument()
    expect(screen.getByText('The board')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1)
    unmount()
    await renderWithProviders(<RunDetails run={run} map={spMap} />, { user: 'admin' })
    await screen.findByText('Staff notes (3)')
    // The old board's note has no id, so nobody can delete it.
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2)
  })

  it('adds a note and deletes one, refreshing the list each time', async () => {
    let list = [...notes.slice(1, 2)]
    const posted: unknown[] = []
    server.use(
      http.get(`${API}/admin/runs/100/notes`, () => HttpResponse.json(list)),
      http.post(`${API}/admin/runs/100/notes`, async ({ request }) => {
        posted.push(await request.json())
        list = [
          ...list,
          {
            ...notes[2]!,
            id: 3,
            author: users.verifier.profile_number,
            author_name: 'Verifier',
            body: 'Second look.',
          },
        ]
        return new HttpResponse(null, { status: 200 })
      }),
      http.delete(`${API}/admin/runs/notes/1`, () => {
        list = list.filter((n) => n.id !== 1)
        return new HttpResponse(null, { status: 200 })
      }),
    )
    await renderWithProviders(<RunDetails run={run} map={spMap} />, { user: 'verifier' })
    expect(await screen.findByText('Staff notes (1)')).toBeInTheDocument()
    const box = screen.getByRole('textbox', { name: 'Staff note' })
    await userEvent.type(box, ' Second look. ')
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }))
    expect(await screen.findByText('Second look.')).toBeInTheDocument()
    expect(box).toHaveValue('')
    expect(posted).toEqual([{ body: 'Second look.' }])
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]!)
    await waitFor(() => expect(screen.queryByText('Checked the demo.')).toBeNull())
    expect(screen.getByText('Staff notes (1)')).toBeInTheDocument()
  })

  it('shows No notes yet when there are none', async () => {
    await renderWithProviders(<RunDetails run={run} map={spMap} />, { user: 'verifier' })
    expect(await screen.findByText('No notes yet.')).toBeInTheDocument()
  })
})

describe('a pending run in Run Details', () => {
  it('offers its player the Add demo button', async () => {
    const mine = { profileNumber: users.player.profile_number, name: 'Player', avatar: null }
    await renderWithProviders(
      <RunDetails run={{ ...run, demoId: null, verified: false, players: [mine] }} map={spMap} />,
      {
        user: 'player',
      },
    )
    expect(await screen.findByText('This run is pending until its demo is added.')).toBeInTheDocument()
    expect(screen.getByText('Add demo')).toBeInTheDocument()
  })
})
