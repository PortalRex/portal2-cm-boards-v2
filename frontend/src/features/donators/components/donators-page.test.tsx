import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderWithProviders } from '@/testing/test-utils'
import { DonatorsPage } from './donators-page'

const donator = (n: number, name: string | null, amount: string | null, boardName: string | null = null) => ({
  profile_number: `7656119800000010${n}`,
  board_name: boardName,
  steam_name: name,
  avatar: null,
  donation_amount: amount,
})

describe('Donators', () => {
  it('lists donators biggest first (then by name), with the total', async () => {
    server.use(
      http.get(`${API}/donators`, () =>
        HttpResponse.json([
          donator(1, 'zed', '10'),
          donator(2, 'Alpha', '101'),
          donator(3, 'beta', '10'),
          donator(4, 'Steam name', '12.5', 'Board name'),
        ]),
      ),
    )
    await renderWithProviders(<DonatorsPage />)
    const rows = within(await screen.findByRole('list')).getAllByRole('link')
    // Rank, the picture's initial (no picture), name and amount.
    expect(rows.map((r) => r.textContent)).toEqual([
      '1AAlpha$101',
      '2BBoard name$12.50',
      '3Bbeta$10',
      '4Zzed$10',
    ])
    expect(rows[0]).toHaveAttribute('href', '/profile/76561198000000102')
    expect(screen.getByText(/4 donators · \$133\.50 in total/)).toBeInTheDocument()
  })

  it('says when nobody has donated', async () => {
    await renderWithProviders(<DonatorsPage />)
    expect(await screen.findByText('No donations yet.')).toBeInTheDocument()
  })
})
