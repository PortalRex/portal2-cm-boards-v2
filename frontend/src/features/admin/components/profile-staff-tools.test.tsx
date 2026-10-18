import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { queryKeys } from '@/lib/query-keys'
import { users } from '@/testing/data/users'
import { API } from '@/testing/mocks/handlers'
import { FIXTURE_PLAYER, serveProfile } from '@/testing/mocks/profile'
import { server } from '@/testing/mocks/server'
import { renderRoute, renderWithProviders } from '@/testing/test-utils'
import type { StaffProfile } from '../utils/staff-powers'
import { ProfileStaffTools } from './profile-staff-tools'

const target: StaffProfile = {
  profileNumber: '76561198099999999',
  name: 'Target',
  avatar: null,
  country: 'hu',
  role: null,
  banned: false,
  frozen: false,
  nameLocked: false,
  avatarLocked: false,
  avatarCustom: false,
  steamName: 'Target Steam',
}

/** Answers every staff change on the target and records what was sent. */
function serveChanges(status = 200) {
  const sent: { path: string; body: unknown }[] = []
  server.use(
    http.put(`${API}/admin/users/:id/:what`, async ({ request, params }) => {
      sent.push({ path: `${String(params.id)}/${String(params.what)}`, body: await request.json() })
      return status === 200
        ? new HttpResponse(null, { status: 204 })
        : new HttpResponse('Moderators and admins only.', { status })
    }),
  )
  return sent
}

const open = async () => {
  await userEvent.click(screen.getByRole('button', { name: /^Staff tools/ }))
  return screen.getByRole('dialog', { name: 'Staff tools: Target' })
}

describe('Profile staff tools', () => {
  it.each([
    ['an anonymous visitor', {}],
    ['a player', { user: 'player' as const }],
    ['staff viewing as a player', { user: 'admin' as const, viewAsPlayer: true }],
  ])("aren't there for %s", async (_, options) => {
    await renderWithProviders(<ProfileStaffTools player={target} />, options)
    expect(screen.queryByRole('button', { name: /Staff tools/ })).not.toBeInTheDocument()
  })

  it('let verifiers freeze only', async () => {
    await renderWithProviders(<ProfileStaffTools player={target} />, { user: 'verifier' })
    const dialog = await open()
    expect(within(dialog).getByRole('button', { name: 'Freeze profile' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Ban profile' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('combobox', { name: 'Role' })).not.toBeInTheDocument()
  })

  it('let moderators change the name, picture and country and ban, but not set roles', async () => {
    await renderWithProviders(<ProfileStaffTools player={target} />, { user: 'moderator' })
    const dialog = await open()
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('Target')
    expect(within(dialog).getByRole('combobox', { name: 'Country' })).toHaveDisplayValue('Hungary')
    expect(within(dialog).getByRole('button', { name: 'Ban profile' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('combobox', { name: 'Role' })).not.toBeInTheDocument()
  })

  it("aren't offered to staff on their own profile when they can do nothing there", async () => {
    await renderWithProviders(
      <ProfileStaffTools
        player={{ ...target, profileNumber: users.verifier.profile_number, role: 'verifier' }}
      />,
      { user: 'verifier' },
    )
    expect(screen.queryByRole('button', { name: /Staff tools/ })).not.toBeInTheDocument()
  })

  it('mark a name or picture set by staff', async () => {
    await renderWithProviders(<ProfileStaffTools player={{ ...target, nameLocked: true }} />, {
      user: 'admin',
    })
    expect(
      screen.getByRole('button', { name: 'Staff tools (name or picture set by staff)' }),
    ).toBeInTheDocument()
    const dialog = await open()
    expect(within(dialog).getByText('(set by staff)')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Use Steam name' })).toHaveAttribute(
      'title',
      'Back to “Target Steam”',
    )
  })

  it('freeze with the reason and reload the profile', async () => {
    const sent = serveChanges()
    const { queryClient } = await renderWithProviders(<ProfileStaffTools player={target} />, {
      user: 'admin',
    })
    const page = [...queryKeys.profile(target.profileNumber), 'page', true]
    queryClient.setQueryData(page, {})
    const dialog = await open()
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Cheated demo ')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Freeze profile' }))
    expect(await within(dialog).findByText('Frozen.')).toBeInTheDocument()
    expect(sent).toEqual([
      { path: `${target.profileNumber}/freeze`, body: { frozen: true, reason: 'Cheated demo' } },
    ])
    expect(queryClient.getQueryState(page)?.isInvalidated).toBe(true)
  })

  it('ban only after a second click', async () => {
    const sent = serveChanges()
    await renderWithProviders(<ProfileStaffTools player={target} />, { user: 'moderator' })
    const dialog = await open()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ban profile' }))
    expect(sent).toEqual([])
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm ban' }))
    expect(await within(dialog).findByText('Banned.')).toBeInTheDocument()
    expect(sent).toEqual([{ path: `${target.profileNumber}/banned`, body: { banned: true } }])
  })

  it('set a name, a picture and a country', async () => {
    const sent = serveChanges()
    await renderWithProviders(<ProfileStaffTools player={target} />, { user: 'moderator' })
    const dialog = await open()
    const name = within(dialog).getByRole('textbox', { name: 'Name' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Better name')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Set name' }))
    await within(dialog).findByText('Name set.')
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Picture address' }),
      'https://x.test/a.png',
    )
    await userEvent.click(within(dialog).getByRole('button', { name: 'Set picture' }))
    await within(dialog).findByText('Picture set.')
    expect(within(dialog).getByRole('textbox', { name: 'Picture address' })).toHaveValue('')
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Country' }), 'No country')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Set country' }))
    await within(dialog).findByText('Country set.')
    expect(sent.map((s) => [s.path.split('/')[1], s.body])).toEqual([
      ['display', { name: 'Better name' }],
      ['display', { avatar: 'https://x.test/a.png' }],
      ['country', { country_id: null }],
    ])
  })

  it('let admins set the staff tier (saved on change, without the reason, as legacy)', async () => {
    const sent = serveChanges()
    await renderWithProviders(<ProfileStaffTools player={target} />, { user: 'admin' })
    const dialog = await open()
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Promoted')
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Role' }), 'Moderator')
    expect(await within(dialog).findByText('Role saved.')).toBeInTheDocument()
    expect(sent).toEqual([{ path: `${target.profileNumber}/role`, body: { role: 'moderator' } }])
  })

  it("show the server's message when a change is refused", async () => {
    serveChanges(403)
    await renderWithProviders(<ProfileStaffTools player={target} />, { user: 'admin' })
    const dialog = await open()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Freeze profile' }))
    expect(await within(dialog).findByText('Moderators and admins only.')).toBeInTheDocument()
  })

  it('close with the close button', async () => {
    await renderWithProviders(<ProfileStaffTools player={target} />, { user: 'admin' })
    const dialog = await open()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it("sit in the profile header for staff (the route fills the header's slot)", async () => {
    serveProfile()
    await renderRoute(`/profile/${FIXTURE_PLAYER}`, { user: 'moderator' })
    expect(await screen.findByRole('button', { name: /^Staff tools/ })).toBeInTheDocument()
  })
})
