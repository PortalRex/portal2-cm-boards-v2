import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderWithProviders } from '@/testing/test-utils'
import { RunDetails, type DetailsRun } from './run-details'

const map = { id: '47759', title: 'Laser Relays', mode: 'sp', game: 'portal2', chapter: 'The Return' }
const run: DetailsRun = { id: 100, score: 2001, players: [], verified: true }

function serveReactions(initial = { up: 2, down: 1, mine: null as 1 | -1 | null }) {
  const sent: unknown[] = []
  let state = { ...initial }
  server.use(
    http.get(`${API}/changelog/:id/segments`, () => HttpResponse.json([])),
    http.get(`${API}/runs/100/reactions`, () => HttpResponse.json(state)),
    http.put(`${API}/runs/100/reaction`, async ({ request }) => {
      const body = (await request.json()) as { reaction: 'up' | 'down' | null }
      sent.push(body)
      const base = { up: initial.up, down: initial.down }
      state =
        body.reaction === 'up'
          ? { ...base, up: base.up + 1, mine: 1 }
          : body.reaction === 'down'
            ? { ...base, down: base.down + 1, mine: -1 }
            : { ...base, mine: null }
      return HttpResponse.json(state)
    }),
  )
  return sent
}

describe('reactions in Run Details', () => {
  it('shows the counts to everyone, but only signed-in players can react', async () => {
    serveReactions()
    await renderWithProviders(<RunDetails run={run} map={map} />)
    const up = await screen.findByRole('button', { name: 'Thumbs up (2)' })
    expect(up).toBeDisabled()
    expect(up).toHaveAttribute('title', 'Sign in to react')
    expect(screen.getByRole('button', { name: 'Thumbs down (1)' })).toBeDisabled()
  })

  it('lets a player react, and click again to clear', async () => {
    const sent = serveReactions()
    await renderWithProviders(<RunDetails run={run} map={map} />, { user: 'player' })
    await userEvent.click(await screen.findByRole('button', { name: 'Thumbs up (2)' }))
    const up = await screen.findByRole('button', { name: 'Thumbs up (3)' })
    expect(up).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(up)
    await screen.findByRole('button', { name: 'Thumbs up (2)' })
    expect(sent).toEqual([{ reaction: 'up' }, { reaction: null }])
  })

  it('is left out where the row has its own buttons (Score Updates)', async () => {
    serveReactions()
    await renderWithProviders(<RunDetails run={run} map={map} showReactions={false} />)
    await screen.findByRole('button', { name: /report run/i })
    expect(screen.queryByRole('button', { name: /thumbs up/i })).toBeNull()
  })
})

describe('reporting a run', () => {
  it('sends an anonymous report with a reason and details', async () => {
    serveReactions()
    const reports: unknown[] = []
    server.use(
      http.post(`${API}/runs/100/report`, async ({ request }) => {
        reports.push(await request.json())
        return new HttpResponse(null, { status: 200 })
      }),
    )
    await renderWithProviders(<RunDetails run={run} map={map} />)
    await userEvent.click(screen.getByRole('button', { name: /report run/i }))
    const form = screen.getByRole('form', { name: 'Report this run' })
    const send = within(form).getByRole('button', { name: 'Send report' })
    expect(send).toBeDisabled()
    await userEvent.selectOptions(within(form).getByRole('combobox', { name: 'Reason' }), 'wrong_time')
    await userEvent.type(within(form).getByRole('textbox', { name: 'Details' }), '  splice at 0:12  ')
    await userEvent.click(send)
    expect(
      await screen.findByText('Thanks, staff will take a look. Reports are anonymous.'),
    ).toBeInTheDocument()
    expect(reports).toEqual([{ reason: 'wrong_time', details: 'splice at 0:12' }])
  })

  it('needs details for "Something else", sends null without them, and shows the server’s reason', async () => {
    serveReactions()
    const reports: unknown[] = []
    server.use(
      http.post(`${API}/runs/100/report`, async ({ request }) => {
        reports.push(await request.json())
        return new HttpResponse('You already reported this run.', { status: 429 })
      }),
    )
    await renderWithProviders(<RunDetails run={run} map={map} />)
    await userEvent.click(screen.getByRole('button', { name: /report run/i }))
    const form = screen.getByRole('form', { name: 'Report this run' })
    await userEvent.selectOptions(within(form).getByRole('combobox', { name: 'Reason' }), 'other')
    expect(within(form).getByRole('textbox', { name: 'Details' })).toBeRequired()
    await userEvent.selectOptions(within(form).getByRole('combobox', { name: 'Reason' }), 'cheating')
    await userEvent.click(within(form).getByRole('button', { name: 'Send report' }))
    expect(await within(form).findByText('You already reported this run.')).toBeInTheDocument()
    expect(reports).toEqual([{ reason: 'cheating', details: null }])
  })

  it('can be cancelled', async () => {
    serveReactions()
    await renderWithProviders(<RunDetails run={run} map={map} />)
    await userEvent.click(screen.getByRole('button', { name: /report run/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('form')).toBeNull())
  })
})
