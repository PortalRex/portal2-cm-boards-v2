import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderRoute } from '@/testing/test-utils'

// Step 6.2: someone switching from the legacy site keeps their settings. Each key has its own
// test next to its hook; this opens the whole site with several saved at once, as the legacy
// site left them.
describe('settings saved by the legacy site', () => {
  it('open the new site in the same state: theme, game and view-as-player', async () => {
    localStorage.setItem('p2cm.theme', 'light')
    localStorage.setItem('p2cm.game', 'mel')
    localStorage.setItem('p2cm.viewAsPlayer', '1')
    localStorage.setItem('p2cm.coopPbStyle', 'border')
    localStorage.setItem('p2cm.collapsed', JSON.stringify(['profile.points']))
    const changelogGames: (string | null)[] = []
    server.use(
      http.get(`${API}/changelog`, ({ request }) => {
        changelogGames.push(new URL(request.url).searchParams.get('game_id'))
        return HttpResponse.json([])
      }),
    )
    await renderRoute('/', { user: 'admin' })
    expect(document.documentElement.dataset.theme).toBe('light')
    // Score Updates asks for Mel's runs.
    await waitFor(() => expect(changelogGames).toContain('2'))
    // An admin viewing as a player gets no staff inbox (and no staff link).
    await screen.findByRole('heading', { name: 'Score Updates' })
    expect(screen.queryByRole('button', { name: /Staff inbox/ })).toBeNull()
    // Nothing was rewritten in a new format.
    expect(localStorage.getItem('p2cm.viewAsPlayer')).toBe('1')
    expect(localStorage.getItem('p2cm.coopPbStyle')).toBe('border')
    expect(localStorage.getItem('p2cm.collapsed')).toBe('["profile.points"]')
  })
})
