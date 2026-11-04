import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderWithProviders } from '@/testing/test-utils'
import type { HeldDemo, ParsedDemo } from '../api/held-demos'
import { HeldDemos } from './held-demos'

const parsed = (over: Partial<ParsedDemo> = {}): ParsedDemo => ({
  mapName: 'sp_a1_intro4',
  gameDirectory: 'portal2',
  clientName: 'Runner',
  timeScore: null,
  portalScore: null,
  timeSource: null,
  players: [{ steamId: '76561198000000011', name: 'Runner' }],
  ...over,
})

const held = (over: Partial<HeldDemo> = {}): HeldDemo => ({
  id: 4,
  profile_number: '76561198000000011',
  user_name: 'Runner',
  avatar: null,
  map_id: '47458',
  map_name: 'Portal Gun',
  game_id: 1,
  is_coop: false,
  source: 'autosubmit',
  claimed_score: 2243,
  reason: 'This demo doesn’t contain a finished challenge mode run.',
  file_size: 3 * 1024 * 1024,
  parsed: parsed(),
  note: null,
  youtube_id: null,
  status: 'pending',
  changelog_id: null,
  reviewed_by_name: null,
  reviewed_at: null,
  review_note: null,
  created_at: '2026-11-03T18:02:11',
  ...over,
})

describe('held demos', () => {
  it('lists waiting demos with why they were refused and what the parser reads', async () => {
    const statuses: (string | null)[] = []
    server.use(
      http.get(`${API}/admin/held-demos`, ({ request }) => {
        const status = new URL(request.url).searchParams.get('status')
        statuses.push(status)
        return HttpResponse.json(
          status === 'pending'
            ? [
                held(),
                held({
                  id: 3,
                  source: 'submit',
                  map_id: null,
                  map_name: null,
                  claimed_score: null,
                  parsed: null,
                  reason: 'That file couldn’t be read as a Portal 2 demo.',
                  note: 'lost session',
                  youtube_id: 'abc',
                }),
              ]
            : [],
        )
      }),
    )
    await renderWithProviders(<HeldDemos />, { user: 'verifier' })
    const cards = await screen.findAllByRole('article')
    const first = within(cards[0]!)
    expect(first.getByText('SAR auto-submit')).toBeInTheDocument()
    expect(first.getByRole('link', { name: 'Portal Gun' })).toHaveAttribute('href', '/map/sp/47458')
    expect(first.getByRole('link', { name: 'Runner' })).toBeInTheDocument()
    expect(first.getByText(/SAR sent/)).toHaveTextContent('SAR sent 22.43')
    expect(first.getByText('This demo doesn’t contain a finished challenge mode run.')).toBeInTheDocument()
    expect(first.getByText(/The demo:/)).toHaveTextContent(
      'The demo: sp_a1_intro4 · no finished run · Runner',
    )
    expect(first.getByRole('link', { name: 'Download demo (3.0 MB)' })).toHaveAttribute(
      'href',
      expect.stringMatching(/\/api\/v1\/admin\/held-demos\/4\/file$/),
    )
    // Accepted with the time SAR sent, as the demo has none.
    expect(first.getByRole('button', { name: 'Accept 22.43' })).toBeEnabled()

    // One the boards can't place or time is entered by hand instead.
    const second = within(cards[1]!)
    expect(second.getByText('Submit Run')).toBeInTheDocument()
    expect(second.getByText('Unknown map')).toBeInTheDocument()
    expect(second.getByText('The demo parser couldn’t read this demo.')).toBeInTheDocument()
    expect(second.getByText(/lost session/)).toBeInTheDocument()
    expect(second.getByRole('link', { name: 'Video' })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=abc',
    )
    expect(second.getByRole('button', { name: 'Accept' })).toBeDisabled()
    expect(
      second.getByText('The demo’s map isn’t known: download it and enter the run by hand in Submit Run.'),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: 'Accepted' }))
    expect(await screen.findByText('No held demos.')).toBeInTheDocument()
    expect(statuses).toEqual(['pending', 'accepted'])
  })

  it('points out a demo whose time isn’t the one SAR sent, and SAR’s timer as the source', async () => {
    server.use(
      http.get(`${API}/admin/held-demos`, () =>
        HttpResponse.json([held({ parsed: parsed({ timeScore: 2250, timeSource: 'sar' }) })]),
      ),
    )
    await renderWithProviders(<HeldDemos />, { user: 'moderator' })
    const card = within(await screen.findByRole('article'))
    expect(card.getByText(/The demo:/).closest('p')).toHaveTextContent(
      'The demo: sp_a1_intro4 · 22.50 (SAR’s timer, no scoreboard) · Runner · not the time SAR sent',
    )
    // The demo's own time is what's recorded.
    expect(card.getByRole('button', { name: 'Accept 22.50' })).toBeEnabled()
  })

  it('accepts one with a note, and shows how it ended', async () => {
    let waiting = true
    const sent: unknown[] = []
    server.use(
      http.get(`${API}/admin/held-demos`, ({ request }) => {
        const status = new URL(request.url).searchParams.get('status')
        if (status === 'all')
          return HttpResponse.json([
            held({
              status: 'accepted',
              changelog_id: 900,
              reviewed_by_name: 'Moderator',
              reviewed_at: '2026-11-03T19:00:00',
              review_note: 'lost session',
            }),
          ])
        return HttpResponse.json(waiting ? [held()] : [])
      }),
      http.post(`${API}/admin/held-demos/4/accept`, async ({ request }) => {
        sent.push(await request.json())
        waiting = false
        return HttpResponse.json({
          changelog_id: 900,
          map_id: '47458',
          map_name: 'Portal Gun',
          score: 2243,
          partner: null,
          waiting_for_partner: false,
          attached: false,
        })
      }),
    )
    await renderWithProviders(<HeldDemos />, { user: 'moderator' })
    await userEvent.type(await screen.findByRole('textbox', { name: 'Note' }), ' lost session ')
    await userEvent.click(screen.getByRole('button', { name: 'Accept 22.43' }))
    expect(await screen.findByText('No demos waiting.')).toBeInTheDocument()
    expect(sent).toEqual([{ note: 'lost session' }])

    await userEvent.click(screen.getByRole('radio', { name: 'All' }))
    const card = within(await screen.findByRole('article'))
    expect(card.getByText(/Accepted by Moderator .* · “lost session”/)).toBeInTheDocument()
    expect(card.getByRole('link', { name: 'Open the run' })).toHaveAttribute('href', '/run/900')
    expect(card.queryByRole('button', { name: /Accept/ })).toBeNull()
  })

  it('re-checks and dismisses, and shows why the server refused', async () => {
    const calls: string[] = []
    server.use(
      http.get(`${API}/admin/held-demos`, () => HttpResponse.json([held()])),
      http.post(`${API}/admin/held-demos/4/recheck`, () => {
        calls.push('recheck')
        return HttpResponse.json({ parsed: null })
      }),
      http.post(`${API}/admin/held-demos/4/dismiss`, async ({ request }) => {
        calls.push(`dismiss ${JSON.stringify(await request.json())}`)
        return new HttpResponse('Someone else is reviewing this demo right now.', { status: 400 })
      }),
    )
    await renderWithProviders(<HeldDemos />, { user: 'moderator' })
    await userEvent.click(await screen.findByRole('button', { name: 'Re-check' }))
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(await screen.findByText('Someone else is reviewing this demo right now.')).toBeInTheDocument()
    expect(calls).toEqual(['recheck', 'dismiss {"note":null}'])
  })
})
