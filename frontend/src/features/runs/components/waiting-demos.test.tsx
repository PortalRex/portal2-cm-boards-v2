import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { users } from '@/testing/data/users'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderWithProviders } from '@/testing/test-utils'
import type { WaitingDemo } from '../api/waiting-demos'
import { WaitingDemos } from './waiting-demos'

const waiting: WaitingDemo = {
  changelog_id: 900,
  map_id: '47741',
  map_name: 'Doors',
  is_coop: true,
  score: 1196,
  timestamp: '2026-11-02T14:32:12',
  partner: '76561197970140234',
  partner_name: 'Runner',
}

function serve(runs: WaitingDemo[], { readOnly = false } = {}) {
  const uploads: number[] = []
  server.use(
    http.get(`${API}/site`, () => HttpResponse.json({ private: false, read_only: readOnly })),
    http.get(`${API}/user/waiting-demos`, () => HttpResponse.json(runs)),
    http.post(`${API}/runs/:id/demo`, ({ params }) => {
      uploads.push(Number(params.id))
      return HttpResponse.json({ verified: true })
    }),
  )
  return uploads
}

describe('WaitingDemos', () => {
  it('lists your runs waiting for your demo, with when they were set, and adds one', async () => {
    const uploads = serve([waiting])
    const me = users.player.profile_number
    await renderWithProviders(<WaitingDemos profileNumber={me} />, { user: 'player' })
    expect(await screen.findByRole('heading', { name: 'A run is waiting for your demo' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Doors' })).toHaveAttribute('href', '/map/coop/47741')
    expect(screen.getByText(/with Runner/)).toBeInTheDocument()
    expect(screen.getByText('Set Mon, 2026-11-02, 14:32:12')).toBeInTheDocument()
    const input = document.querySelector('input[type=file]') as HTMLInputElement
    await userEvent.upload(input, new File(['HL2DEMO'], 'doors.dem'))
    expect(await screen.findByText('Demo added.')).toBeInTheDocument()
    expect(uploads).toEqual([900])
  })

  it("isn't shown on someone else's profile, signed out, or while the boards are read-only, even to staff", async () => {
    serve([waiting])
    const { unmount } = await renderWithProviders(<WaitingDemos profileNumber="76561190000000000" />, {
      user: 'player',
    })
    await waitFor(() => expect(screen.queryByRole('heading')).not.toBeInTheDocument())
    unmount()

    const signedOut = await renderWithProviders(<WaitingDemos />)
    await waitFor(() => expect(screen.queryByRole('heading')).not.toBeInTheDocument())
    signedOut.unmount()

    serve([waiting], { readOnly: true })
    const readOnly = await renderWithProviders(<WaitingDemos />, { user: 'player' })
    await waitFor(() => expect(screen.queryByRole('heading')).not.toBeInTheDocument())
    readOnly.unmount()

    // Staff can still make changes while read-only, but nobody is asked for demos until it ends.
    await renderWithProviders(<WaitingDemos />, { user: 'admin' })
    await waitFor(() => expect(screen.queryByRole('heading')).not.toBeInTheDocument())
  })

  it('shows nothing when no run is waiting', async () => {
    serve([])
    await renderWithProviders(<WaitingDemos />, { user: 'player' })
    await waitFor(() => expect(screen.queryByRole('heading')).not.toBeInTheDocument())
  })
})
