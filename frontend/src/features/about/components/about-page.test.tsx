import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderWithProviders } from '@/testing/test-utils'
import { AboutPage } from './about-page'

describe('About', () => {
  it('explains the boards and links around the site', async () => {
    await renderWithProviders(<AboutPage />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Portal 2 Challenge Mode Leaderboards' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Aggregate' })).toHaveAttribute('href', '/leaderboard/overall')
    expect(screen.getByRole('link', { name: 'Donators' })).toHaveAttribute('href', '/more/donators')
    expect(screen.getByRole('link', { name: 'rules.portal2.sr' })).toHaveAttribute('target', '_blank')
  })

  it('shows what each example rank is worth', async () => {
    await renderWithProviders(<AboutPage />)
    const rows = within(screen.getByRole('table', { name: 'Points by rank' })).getAllByRole('row')
    expect(rows.map((r) => r.textContent)).toEqual([
      '#1200',
      '#2198',
      '#5192.1',
      '#10182.4',
      '#25154.9',
      '#50114',
      '#10051',
      '#15013',
      '#2001',
    ])
  })

  it('lists the staff from the server by tier, each name linking to the profile', async () => {
    const member = (profile_number: string, user_name: string, role: string) => ({
      profile_number,
      user_name,
      avatar: null,
      role,
    })
    server.use(
      http.get(`${API}/staff`, () =>
        HttpResponse.json([
          member('76561198045074889', 'Jonese1234', 'admin'),
          member('76561198000000004', 'New Admin', 'admin'),
          member('76561198000000003', 'Mod', 'moderator'),
          member('76561198000000002', 'Verifier One', 'verifier'),
          member('76561198000000005', 'Verifier Two', 'verifier'),
        ]),
      ),
    )
    await renderWithProviders(<AboutPage />)
    const team = await screen.findByText('Developers and admins')
    const card = team.closest('article')!
    const groups = [...card.querySelectorAll('div')].map((g) => g.textContent)
    expect(groups).toEqual([
      'Developers and adminsJonese1234',
      'AdminsNew Admin',
      'ModeratorsMod',
      'VerifiersVerifier One, Verifier Two',
    ])
    expect(within(card as HTMLElement).getByRole('link', { name: 'Verifier Two' })).toHaveAttribute(
      'href',
      '/profile/76561198000000005',
    )
  })
})
