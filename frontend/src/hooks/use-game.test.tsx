import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '@/testing/test-utils'
import { useGamePicker } from './use-game'
import { useSeason } from './use-season'

function Probe() {
  const [game, pick] = useGamePicker()
  const season = useSeason('portal2')
  return (
    <div>
      <p>game: {game}</p>
      <p>season: {season ?? 'none'}</p>
      <button onClick={() => pick('custom-game')}>pick</button>
    </div>
  )
}

describe('useGame', () => {
  it('is Portal 2 by default', async () => {
    renderWithProviders(<Probe />)
    expect(await screen.findByText('game: portal2')).toBeInTheDocument()
  })

  it('opens on the game saved by the legacy site', async () => {
    localStorage.setItem('p2cm.game', 'mel')
    renderWithProviders(<Probe />)
    expect(await screen.findByText('game: mel')).toBeInTheDocument()
  })

  it('follows the address and remembers it for the next page', async () => {
    localStorage.setItem('p2cm.game', 'portal2')
    renderWithProviders(<Probe />, { route: '/leaderboard/mel/story' })
    expect(await screen.findByText('game: mel')).toBeInTheDocument()
    await waitFor(() => expect(localStorage.getItem('p2cm.game')).toBe('mel'))
  })

  it('saves the game picked in the header', async () => {
    renderWithProviders(<Probe />)
    // The custom game exists once the server catalog has loaded.
    await screen.findByText('game: portal2')
    await userEvent.click(screen.getByRole('button', { name: 'pick' }))
    expect(await screen.findByText('game: custom-game')).toBeInTheDocument()
    expect(localStorage.getItem('p2cm.game')).toBe('custom-game')
  })
})

describe('useSeason', () => {
  it("reads ?season= when it's a season of the game", async () => {
    renderWithProviders(<Probe />, { route: '/maps?season=portal-2-season-1' })
    expect(await screen.findByText('season: portal-2-season-1')).toBeInTheDocument()
  })

  it('ignores anything else', async () => {
    renderWithProviders(<Probe />, { route: '/maps?season=mel' })
    expect(await screen.findByText('season: none')).toBeInTheDocument()
  })
})
