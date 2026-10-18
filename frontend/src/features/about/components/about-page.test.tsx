import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
})
