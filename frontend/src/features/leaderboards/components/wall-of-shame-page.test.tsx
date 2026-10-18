import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderRoute } from '@/testing/test-utils'
import type { BannedUserRaw } from '../api/wall-of-shame'

const banned: BannedUserRaw[] = [
  { profile_number: '76561197960339145', user_name: 'louis vuitton', avatar: 'https://example.com/a.jpg' },
  { profile_number: '76561198000000002', user_name: 'Émile', avatar: null },
  { profile_number: '76561198000000003', user_name: 'Abe', avatar: 'https://example.com/c.jpg' },
]

const serve = (rows: BannedUserRaw[]) =>
  server.use(http.get(`${API}/wall_of_shame`, () => HttpResponse.json(rows)))

// Each card reads "<name><steam id>" (plus the initial when there is no picture).
const cards = () =>
  within(screen.getByRole('list', { name: 'Banned players' }))
    .getAllByRole('link')
    .map((a) => a.textContent)
const names = (...expected: string[]) => expected.map((n) => expect.stringContaining(n) as unknown)

describe('Wall of Shame', () => {
  it('lists banned players by name, ignoring case and accents, linking to their profiles', async () => {
    serve(banned)
    await renderRoute('/more/wall-of-shame')
    expect(await screen.findByText('3 banned players')).toBeInTheDocument()
    expect(cards()).toEqual(names('Abe', 'Émile', 'louis vuitton'))
    const louis = screen.getByRole('link', { name: /louis vuitton/ })
    expect(louis).toHaveAttribute('href', '/profile/76561197960339145')
    expect(within(louis).getByText('76561197960339145')).toBeInTheDocument()
  })

  it('searches by name or Steam id and counts the matches', async () => {
    serve(banned)
    await renderRoute('/more/wall-of-shame')
    const box = await screen.findByRole('searchbox', { name: 'Search banned players' })
    await userEvent.type(box, 'LOUIS')
    expect(cards()).toEqual(names('louis vuitton'))
    expect(screen.getByText('1 of 3')).toBeInTheDocument()

    await userEvent.clear(box)
    await userEvent.type(box, '000000002')
    expect(cards()).toEqual(names('Émile'))

    await userEvent.clear(box)
    await userEvent.type(box, 'nobody')
    expect(screen.getByText('No banned players match “nobody”.')).toBeInTheDocument()
    expect(screen.getByText('0 of 3')).toBeInTheDocument()
  })

  it('says so when nobody is banned', async () => {
    serve([])
    await renderRoute('/more/wall-of-shame')
    expect(await screen.findByText('Nobody is banned.')).toBeInTheDocument()
    expect(screen.getByText('0 banned players')).toBeInTheDocument()
  })

  it('shows an error state when the list fails to load', async () => {
    server.use(
      http.get(`${API}/wall_of_shame`, () => HttpResponse.json({ error: 'Database down' }, { status: 500 })),
    )
    await renderRoute('/more/wall-of-shame')
    expect(await screen.findByText(/Database down/)).toBeInTheDocument()
    expect(screen.queryByText(/^\d+ banned players$/)).not.toBeInTheDocument()
  })
})
