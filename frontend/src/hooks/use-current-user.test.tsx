import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { isStaff } from '@/lib/auth'
import { renderWithProviders } from '@/testing/test-utils'
import { useCurrentUser } from './use-current-user'
import { useViewAsPlayer } from './use-view-as-player'

function Probe() {
  const user = useCurrentUser()
  const [asPlayer, setAsPlayer] = useViewAsPlayer()
  return (
    <div>
      <p>{user ? `${user.name} ${user.role ?? 'player'} ${user.staffRole ?? ''}`.trim() : 'signed out'}</p>
      <p>{isStaff(user) ? 'staff tools' : 'no staff tools'}</p>
      <button onClick={() => setAsPlayer(!asPlayer)}>toggle</button>
    </div>
  )
}

describe('useCurrentUser', () => {
  it('is null when signed out', async () => {
    await renderWithProviders(<Probe />)
    expect(await screen.findByText('signed out')).toBeInTheDocument()
  })

  it('gives staff their role', async () => {
    await renderWithProviders(<Probe />, { user: 'moderator' })
    expect(await screen.findByText('Moderator moderator')).toBeInTheDocument()
    expect(screen.getByText('staff tools')).toBeInTheDocument()
  })

  it('hides the role while viewing as a player, saved as "1" in the legacy key', async () => {
    await renderWithProviders(<Probe />, { user: 'admin', viewAsPlayer: true })
    expect(await screen.findByText('Admin player admin')).toBeInTheDocument()
    expect(screen.getByText('no staff tools')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'toggle' }))
    expect(await screen.findByText('staff tools')).toBeInTheDocument()
    expect(localStorage.getItem('p2cm.viewAsPlayer')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'toggle' }))
    expect(localStorage.getItem('p2cm.viewAsPlayer')).toBe('1')
  })
})
