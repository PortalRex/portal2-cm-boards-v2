import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderRoute } from '@/testing/test-utils'

const privateSite = () => server.use(http.get(`${API}/site`, () => HttpResponse.json({ private: true })))

describe('private mode', () => {
  it('shows the site to everyone when the site is public', async () => {
    await renderRoute('/')
    expect(await screen.findByRole('heading', { name: 'Score Updates' })).toBeInTheDocument()
  })

  it('asks anonymous visitors to sign in, coming back to the page', async () => {
    privateSite()
    await renderRoute('/profile/1?tab=mel')
    expect(await screen.findByText('Coming soon!')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /sign in through steam/i })).toHaveAttribute(
      'href',
      'http://localhost:3000/api/v1/auth/steam/login?return=%2Fprofile%2F1%3Ftab%3Dmel',
    )
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
  })

  it('tells a signed-in player it is not a staff account, and signs them out', async () => {
    privateSite()
    server.use(http.post(`${API}/auth/logout`, () => new HttpResponse(null, { status: 204 })))
    await renderRoute('/', { user: 'player' })
    expect(await screen.findByText(/which isn’t a staff account/)).toHaveTextContent('Player')
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('link', { name: /sign in through steam/i })).toBeInTheDocument()
  })

  it.each(['verifier', 'moderator', 'admin'] as const)('lets a %s in', async (user) => {
    privateSite()
    await renderRoute('/', { user })
    expect(await screen.findByRole('heading', { name: 'Score Updates' })).toBeInTheDocument()
  })

  it('lets staff viewing the site as a player in', async () => {
    privateSite()
    await renderRoute('/', { user: 'admin', viewAsPlayer: true })
    expect(await screen.findByRole('heading', { name: 'Score Updates' })).toBeInTheDocument()
  })

  it('keeps banned staff out', async () => {
    privateSite()
    await renderRoute('/', { user: 'bannedAdmin' })
    expect(await screen.findByText('Coming soon!')).toBeInTheDocument()
  })
})
