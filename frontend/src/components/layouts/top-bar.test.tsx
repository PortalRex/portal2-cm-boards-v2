import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { renderWithProviders } from '@/testing/test-utils'
import { LayoutSlotsContext } from './slots'
import { TopBar } from './top-bar'

const nav = () => screen.getByRole('navigation', { name: 'Main' })

describe('TopBar', () => {
  it('shows the five sections and marks the one you are on', async () => {
    await renderWithProviders(<TopBar />, { route: '/maps' })
    const links = within(nav())
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href') !== null)
    expect(
      ['Score Updates', 'Leaderboard', 'Aggregate', 'Stats', 'More'].map((name) =>
        within(nav()).getByRole('link', { name }),
      ),
    ).toHaveLength(5)
    expect(within(nav()).getByRole('link', { name: 'Leaderboard' })).toHaveAttribute('aria-current', 'page')
    expect(links.length).toBeGreaterThan(5)
  })

  it("opens the selected game's boards from Aggregate", async () => {
    localStorage.setItem('p2cm.game', 'mel')
    await renderWithProviders(<TopBar />)
    expect(await within(nav()).findByRole('link', { name: 'Aggregate' })).toHaveAttribute(
      'href',
      '/leaderboard/mel/overall',
    )
    expect(within(nav()).getByRole('link', { name: 'Story Mode' })).toBeInTheDocument()
  })

  it('lists Portal 2 chapters and tags the board you are on', async () => {
    await renderWithProviders(<TopBar />, { route: '/leaderboard/chapter/8' })
    expect(within(nav()).getByRole('link', { name: /The Cold Boot/ })).toHaveAttribute('aria-current', 'page')
    // The board holding that chapter is tagged too.
    expect(within(nav()).getByRole('link', { name: 'Single Player' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav()).getAllByRole('link', { name: 'Total' })).toHaveLength(2)
  })

  it('has the More menu with outside links in a new tab', async () => {
    await renderWithProviders(<TopBar />)
    expect(within(nav()).getByRole('link', { name: 'Discord' })).toHaveAttribute('target', '_blank')
    expect(within(nav()).getByRole('link', { name: 'Wall Of Shame' })).toHaveAttribute(
      'href',
      '/more/wall-of-shame',
    )
  })

  it('offers Steam sign-in that comes back to the page', async () => {
    await renderWithProviders(<TopBar />, { route: '/map/sp/47458?signin=failed' })
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      'http://localhost:3000/api/v1/auth/steam/login?return=%2Fmap%2Fsp%2F47458',
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Steam sign-in didn’t complete')
  })

  it('shows a player their menu without the staff link', async () => {
    await renderWithProviders(<TopBar />, { user: 'player' })
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/more/settings')
    expect(screen.queryByRole('link', { name: 'Staff' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled()
  })

  describe('your picture', () => {
    const touchScreen = (touch: boolean) => {
      window.matchMedia = ((query: string) => ({ matches: touch && query === '(hover: none)' })) as never
    }
    afterEach(() => {
      delete (window as { matchMedia?: unknown }).matchMedia
    })

    it('opens its menu on a touch screen instead of leaving the page, and closes it again', async () => {
      touchScreen(true)
      const { router } = await renderWithProviders(<TopBar />, { user: 'player', route: '/maps' })
      const picture = screen.getByRole('link', { name: 'Your profile' })
      expect(picture).toHaveAttribute('aria-expanded', 'false')
      await userEvent.click(picture)
      expect(picture).toHaveAttribute('aria-expanded', 'true')
      expect(router.state.location.pathname).toBe('/maps')
      expect(
        within(within(picture.parentElement!).getByRole('menu')).getByRole('link', { name: 'My Profile' }),
      ).toBeInTheDocument()
      await userEvent.keyboard('{Escape}')
      expect(picture).toHaveAttribute('aria-expanded', 'false')
      await userEvent.click(picture)
      await userEvent.click(within(nav()).getByRole('link', { name: 'Stats' }))
      expect(picture).toHaveAttribute('aria-expanded', 'false')
      // Going to your profile from the menu closes it: nothing in it keeps focus (which shows it).
      await userEvent.click(picture)
      await userEvent.click(
        within(within(picture.parentElement!).getByRole('menu')).getByRole('link', { name: 'My Profile' }),
      )
      await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/profile\//))
      expect(picture).toHaveAttribute('aria-expanded', 'false')
      expect(picture.parentElement!.contains(document.activeElement)).toBe(false)
    })

    it('goes to your profile when clicked with a mouse', async () => {
      touchScreen(false)
      const { router } = await renderWithProviders(<TopBar />, { user: 'player', route: '/maps' })
      await userEvent.click(screen.getByRole('link', { name: 'Your profile' }))
      expect(router.state.location.pathname).toMatch(/^\/profile\//)
    })
  })

  it.each(['verifier', 'moderator', 'admin'] as const)('shows the staff link to a %s', async (user) => {
    await renderWithProviders(<TopBar />, { user })
    expect(screen.getByRole('link', { name: 'Staff' })).toHaveAttribute('href', '/admin')
  })

  it('hides staff links and the inbox from staff viewing as a player', async () => {
    await renderWithProviders(
      <LayoutSlotsContext.Provider value={{ staffInbox: <button>Inbox</button> }}>
        <TopBar />
      </LayoutSlotsContext.Provider>,
      { user: 'admin', viewAsPlayer: true },
    )
    expect(screen.queryByRole('link', { name: 'Staff' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Inbox' })).toBeNull()
  })

  it('fills the Submit Run and staff inbox slots for the right users', async () => {
    const slots = {
      staffInbox: <button>Inbox</button>,
      submitRun: (close: () => void) => <button onClick={close}>Submit dialog</button>,
    }
    await renderWithProviders(
      <LayoutSlotsContext.Provider value={slots}>
        <TopBar />
      </LayoutSlotsContext.Provider>,
      { user: 'moderator' },
    )
    expect(screen.getByRole('button', { name: 'Inbox' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /submit run/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit dialog' }))
    expect(screen.queryByRole('button', { name: 'Submit dialog' })).toBeNull()
  })

  it('keeps Submit Run from signed-out visitors', async () => {
    await renderWithProviders(
      <LayoutSlotsContext.Provider value={{ submitRun: () => null }}>
        <TopBar />
      </LayoutSlotsContext.Provider>,
    )
    expect(screen.queryByRole('button', { name: /submit run/i })).toBeNull()
  })

  it('switches the theme and remembers it', async () => {
    await renderWithProviders(<TopBar />)
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('p2cm.theme')).toBe('light')
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument()
  })

  it('switches game from the logo menu, going to the new game’s boards', async () => {
    const { router } = await renderWithProviders(<TopBar />, { route: '/leaderboard/sp' })
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Portal Stories: Mel' }))
    expect(localStorage.getItem('p2cm.game')).toBe('mel')
    expect(router.state.location.pathname).toBe('/leaderboard/mel/overall')
  })

  it('opens and closes the phone menu', async () => {
    await renderWithProviders(<TopBar />)
    const toggle = screen.getByRole('button', { name: 'Menu' })
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})
