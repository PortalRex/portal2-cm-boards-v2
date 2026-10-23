import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import changelog from '@/testing/fixtures/profile-changelog.json'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
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
})
