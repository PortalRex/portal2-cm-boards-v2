import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { PendingProof } from '@/features/runs/components/pending-proof'
import { ReactionsBar } from '@/features/runs/components/reactions-bar'
import { ReportRun } from '@/features/runs/components/report-run'
import { SettingsPage } from '@/features/settings/components/settings-page'
import { users } from '@/testing/data/users'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderWithProviders } from '@/testing/test-utils'
import { ReadOnlyBanner } from '@/components/layouts/read-only-banner'
import { LayoutSlotsContext } from '@/components/layouts/slots'
import { TopBar } from '@/components/layouts/top-bar'

const readOnly = () =>
  server.use(http.get(`${API}/site`, () => HttpResponse.json({ private: false, read_only: true })))
const submitSlot = { submitRun: () => <span>dialog</span> }

describe('read-only mode', () => {
  it('says so under the top bar, differently for staff', async () => {
    readOnly()
    const { unmount } = await renderWithProviders(<ReadOnlyBanner />, { user: 'player' })
    expect(
      await screen.findByText(/read-only for now: submitting runs, reactions and reports open soon/),
    ).toBeInTheDocument()
    unmount()
    await renderWithProviders(<ReadOnlyBanner />, { user: 'verifier' })
    expect(await screen.findByText('Read-only mode is on: only staff can make changes.')).toBeInTheDocument()
  })

  it('shows nothing when it is off', async () => {
    await renderWithProviders(<ReadOnlyBanner />, { user: 'player' })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('hides Submit Run from players, not from staff', async () => {
    readOnly()
    const { unmount } = await renderWithProviders(
      <LayoutSlotsContext.Provider value={submitSlot}>
        <TopBar />
      </LayoutSlotsContext.Provider>,
      { user: 'player' },
    )
    // The site's mode loads with the first page (the root route waits for it); here it comes just after.
    await waitFor(() => expect(screen.queryByRole('button', { name: /submit run/i })).toBeNull())
    unmount()
    await renderWithProviders(
      <LayoutSlotsContext.Provider value={submitSlot}>
        <TopBar />
      </LayoutSlotsContext.Provider>,
      { user: 'moderator' },
    )
    expect(await screen.findByRole('button', { name: /submit run/i })).toBeInTheDocument()
  })

  it('keeps the reaction counts but not the buttons, and has no Report run or Add demo', async () => {
    readOnly()
    server.use(http.get(`${API}/runs/100/reactions`, () => HttpResponse.json({ up: 3, down: 1, mine: null })))
    await renderWithProviders(
      <>
        <ReactionsBar changelogId={100} />
        <ReportRun changelogId={100} />
        <PendingProof
          run={{
            changelogId: 100,
            players: [{ profileNumber: users.player.profile_number, name: 'Player', avatar: null }],
            verified: false,
          }}
        />
      </>,
      { user: 'player' },
    )
    const up = await screen.findByRole('button', { name: 'Thumbs up (3)' })
    expect(up).toBeDisabled()
    expect(up).toHaveAttribute('title', 'Reactions open soon')
    expect(screen.queryByText('Report run')).toBeNull()
    expect(screen.queryByText('Add demo')).toBeNull()
  })

  it('holds back the profile settings in Settings', async () => {
    readOnly()
    server.use(
      http.get(`${API}/user/${users.player.profile_number}`, () =>
        HttpResponse.json({
          profile_number: users.player.profile_number,
          board_name: null,
          steam_name: 'Player',
          avatar: null,
          country_id: null,
        }),
      ),
    )
    await renderWithProviders(<SettingsPage />, { user: 'player' })
    expect(await screen.findByText(/can be changed once the boards open for changes/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull()
    expect(screen.queryByText('SAR auto-submit')).toBeNull()
    // Appearance is this browser's own setting, so it stays.
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument()
  })
})
