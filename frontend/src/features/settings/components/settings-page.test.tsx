import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { users } from '@/testing/data/users'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderWithProviders } from '@/testing/test-utils'
import type { MyUser } from '../api/settings'
import { SettingsPage } from './settings-page'

const me = users.player.profile_number

function serveUser(over: Partial<MyUser> = {}) {
  let user: MyUser = {
    profile_number: me,
    board_name: null,
    steam_name: 'Player',
    avatar: null,
    country_id: null,
    ...over,
  }
  const sent: { path: string; body: unknown }[] = []
  const record =
    (path: string) =>
    async ({ request }: { request: Request }) => {
      const body = await request.json().catch(() => null)
      sent.push({ path, body })
      return body
    }
  server.use(
    http.get(`${API}/user/${me}`, () => HttpResponse.json(user)),
    http.put(`${API}/user/display`, async (info) => {
      const body = (await record('display')(info)) as { name?: string | null }
      if ('name' in body) user = { ...user, board_name: body.name ?? null }
      return new HttpResponse(null, { status: 200 })
    }),
    http.put(`${API}/user/country`, async (info) => {
      const body = (await record('country')(info)) as { country_id: number | null }
      user = { ...user, country_id: body.country_id }
      return HttpResponse.json(body)
    }),
  )
  return sent
}

describe('Settings', () => {
  it('shows visitors the appearance switches and a sign-in link', async () => {
    await renderWithProviders(<SettingsPage />)
    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in through Steam' }).getAttribute('href')).toContain(
      'return=%2Fmore%2Fsettings',
    )
    expect(screen.getByText('Not signed in.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Country' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Staff' })).toBeNull()
  })

  it('switches the theme and the co-op PB style, saved in this browser', async () => {
    await renderWithProviders(<SettingsPage />)
    await userEvent.click(screen.getByRole('radio', { name: 'Light' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('p2cm.theme')).toBe('light')
    // The coloured name until the trophy is picked.
    expect(screen.getByRole('radio', { name: 'Coloured name' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'Trophy' }))
    expect(localStorage.getItem('p2cm.coopPbStyle')).toBe('icon')
  })

  it('turns the liquid glass look on and off, saved in this browser', async () => {
    await renderWithProviders(<SettingsPage />)
    const glass = within(screen.getByRole('radiogroup', { name: 'Liquid glass' }))
    expect(glass.getByRole('radio', { name: 'Off' })).toBeChecked()
    await userEvent.click(glass.getByRole('radio', { name: 'On' }))
    expect(document.documentElement.dataset.glass).toBe('on')
    expect(localStorage.getItem('p2cm.glass')).toBe('1')
    // A look on top of the theme: the theme switch keeps its own choice.
    await userEvent.click(screen.getByRole('radio', { name: 'Light' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.dataset.glass).toBe('on')
    await userEvent.click(glass.getByRole('radio', { name: 'Off' }))
    expect(document.documentElement.dataset.glass).toBeUndefined()
    expect(localStorage.getItem('p2cm.glass')).toBeNull()
  })

  it('saves your own name, and goes back to the Steam one', async () => {
    const sent = serveUser()
    await renderWithProviders(<SettingsPage />, { user: 'player' })
    const name = await screen.findByRole('textbox', { name: 'Name' })
    expect(name).toHaveValue('Player')
    expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Use my Steam name' })).toBeDisabled()
    await userEvent.clear(name)
    await userEvent.type(name, ' Chell ')
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }))
    expect(await screen.findByText('Name saved.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Use my Steam name' })).toBeEnabled())
    expect(name).toHaveValue('Chell')
    await userEvent.click(screen.getByRole('button', { name: 'Use my Steam name' }))
    expect(await screen.findByText('Back to your Steam name.')).toBeInTheDocument()
    expect(sent).toEqual([
      { path: 'display', body: { name: 'Chell' } },
      { path: 'display', body: { name: null } },
    ])
  })

  it('sets the picture from an address or from Steam', async () => {
    const sent = serveUser()
    await renderWithProviders(<SettingsPage />, { user: 'player' })
    await userEvent.type(
      await screen.findByRole('textbox', { name: 'Picture address' }),
      'https://i.imgur.com/AbCd123.png',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save picture' }))
    expect(await screen.findByText('Picture saved.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Picture address' })).toHaveValue('')
    await userEvent.click(screen.getByRole('button', { name: 'Use my Steam picture' }))
    expect(await screen.findByText('Set to your current Steam picture.')).toBeInTheDocument()
    expect(sent.map((s) => s.body)).toEqual([
      { avatar: 'https://i.imgur.com/AbCd123.png' },
      { avatar: 'steam' },
    ])
  })

  it('shows why a picture was refused and keeps the address to fix', async () => {
    serveUser()
    const refusal = 'The picture has to be on Steam or Imgur (an https:// address of the image itself).'
    server.use(http.put(`${API}/user/display`, () => new HttpResponse(refusal, { status: 400 })))
    await renderWithProviders(<SettingsPage />, { user: 'player' })
    const address = await screen.findByRole('textbox', { name: 'Picture address' })
    expect(address).toHaveAttribute('placeholder', 'Steam or Imgur image address (https://…)')
    await userEvent.type(address, 'https://evil.example/pixel.png')
    await userEvent.click(screen.getByRole('button', { name: 'Save picture' }))
    expect(await screen.findByText(refusal)).toBeInTheDocument()
    expect(screen.queryByText('Picture saved.')).toBeNull()
    expect(address).toHaveValue('https://evil.example/pixel.png')
  })

  it('locks what staff have set', async () => {
    serveUser({ board_name: 'Renamed', name_locked: true, avatar_locked: true })
    await renderWithProviders(<SettingsPage />, { user: 'player' })
    expect(await screen.findByRole('textbox', { name: 'Name' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Picture address' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Use my Steam picture' })).toBeDisabled()
    expect(
      screen.getByText("Your name and picture were set by staff, so they can't be changed here."),
    ).toBeInTheDocument()
  })

  it('says which one is locked when only one is', async () => {
    serveUser({ avatar_locked: true })
    await renderWithProviders(<SettingsPage />, { user: 'player' })
    expect(
      await screen.findByText("Your picture was set by staff, so it can't be changed here."),
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeEnabled()
  })

  it('saves the country, and shows why Steam’s couldn’t be used', async () => {
    const sent = serveUser({ country_id: 226 })
    server.use(
      http.post(`${API}/user/country/steam`, () =>
        HttpResponse.json({ error: 'Your Steam profile shows no country.' }, { status: 404 }),
      ),
    )
    await renderWithProviders(<SettingsPage />, { user: 'player' })
    const select = await screen.findByRole('combobox', { name: 'Country' })
    await waitFor(() => expect(select).toHaveValue('226'))
    await userEvent.selectOptions(select, '')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect(sent).toEqual([{ path: 'country', body: { country_id: null } }])
    expect(select).toHaveValue('')
    await userEvent.click(screen.getByRole('button', { name: 'Use my Steam country' }))
    expect(await screen.findByText('Your Steam profile shows no country.')).toBeInTheDocument()
  })

  it('lets staff view the site as a player and back', async () => {
    serveUser()
    await renderWithProviders(<SettingsPage />, { user: 'moderator' })
    expect(screen.getByText(/Signed in through Steam as/)).toHaveTextContent(
      'Signed in through Steam as Moderator (Moderator).',
    )
    await userEvent.click(screen.getByRole('radio', { name: 'As a player' }))
    expect(localStorage.getItem('p2cm.viewAsPlayer')).toBe('1')
    // Still the staff section and real role while viewing as a player.
    expect(screen.getByRole('radio', { name: 'As a player' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'As moderator' }))
    expect(localStorage.getItem('p2cm.viewAsPlayer')).toBeNull()
  })

  it('has no staff switch for players', async () => {
    serveUser()
    await renderWithProviders(<SettingsPage />, { user: 'player' })
    await screen.findByRole('heading', { name: 'Country' })
    expect(screen.queryByRole('heading', { name: 'Staff' })).toBeNull()
  })

  it('signs out', async () => {
    serveUser()
    let signedOut = false
    server.use(
      http.post(`${API}/auth/logout`, () => {
        signedOut = true
        return new HttpResponse(null, { status: 200 })
      }),
    )
    await renderWithProviders(<SettingsPage />, { user: 'player' })
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByText('Not signed in.')).toBeInTheDocument()
    expect(signedOut).toBe(true)
  })
})

describe('SAR auto-submit key', () => {
  const key = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'

  function serveKey(initial: { has_key: boolean; created: string | null }) {
    let status = initial
    const calls: string[] = []
    server.use(
      http.get(`${API}/user/submit-key`, () => HttpResponse.json(status)),
      http.post(`${API}/user/submit-key`, () => {
        calls.push('make')
        status = { has_key: true, created: '2026-10-23T01:00:00' }
        return HttpResponse.json({ key })
      }),
      http.delete(`${API}/user/submit-key`, () => {
        calls.push('remove')
        status = { has_key: false, created: null }
        return HttpResponse.json({ has_key: false })
      }),
    )
    return calls
  }

  it('makes a key and shows it once, as SAR’s autosubmit.key', async () => {
    serveUser()
    const calls = serveKey({ has_key: false, created: null })
    await renderWithProviders(<SettingsPage />, { user: 'player' })
    expect(await screen.findByText("You don't have a key yet.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Make a key' }))
    const file = await screen.findByLabelText('autosubmit.key')
    expect(file.textContent).toBe(`${window.location.host}
${key}
`)
    expect(screen.getByText(/it isn.t shown again/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download autosubmit.key' })).toBeInTheDocument()
    expect(calls).toEqual(['make'])
  })

  it('asks before replacing a key, and removes it', async () => {
    serveUser()
    const calls = serveKey({ has_key: true, created: '2026-10-20T12:00:00' })
    await renderWithProviders(<SettingsPage />, { user: 'player' })
    expect(await screen.findByText(/You have a key \(made /)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Make a new key' }))
    expect(screen.getByText(/Your current key stops working/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(calls).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: 'Remove key' }))
    expect(await screen.findByText("You don't have a key yet.")).toBeInTheDocument()
    expect(calls).toEqual(['remove'])
  })

  it('is only for signed-in players', async () => {
    await renderWithProviders(<SettingsPage />)
    expect(screen.queryByText('SAR auto-submit')).toBeNull()
  })
})
