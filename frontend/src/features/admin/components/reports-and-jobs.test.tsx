import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderWithProviders } from '@/testing/test-utils'
import type { BackgroundJob } from '../api/jobs'
import type { RunReport } from '../api/reports'
import { BackgroundJobs } from './background-jobs'
import { Reports } from './reports'

const report = (over: Partial<RunReport> = {}): RunReport => ({
  id: 7,
  changelog_id: 100,
  reason: 'cheating',
  details: 'Timer starts late',
  status: 'open',
  created_at: '2026-10-17T10:00:00',
  resolved_at: null,
  resolution_note: null,
  resolved_by_name: null,
  open_on_run: 1,
  map_id: '47458',
  map_name: 'Portal Gun',
  game_id: 1,
  is_coop: false,
  score: 2243,
  post_rank: 2,
  run_banned: false,
  run_verified: true,
  has_demo: true,
  youtube_id: 'abc?t=3',
  timestamp: null,
  profile_number: '76561198000000011',
  user_name: 'Runner',
  avatar: null,
  partner: null,
  partner_name: null,
  ...over,
})

describe('run reports', () => {
  it('lists open reports with the run, and asks for others by status', async () => {
    const statuses: (string | null)[] = []
    server.use(
      http.get(`${API}/admin/reports`, ({ request }) => {
        const status = new URL(request.url).searchParams.get('status')
        statuses.push(status)
        return HttpResponse.json(
          status === 'open'
            ? [
                report(),
                report({
                  id: 6,
                  reason: 'wrong_time',
                  run_banned: true,
                  run_verified: false,
                  has_demo: false,
                  youtube_id: null,
                }),
              ]
            : [],
        )
      }),
    )
    await renderWithProviders(<Reports />, { user: 'verifier' })
    const cards = await screen.findAllByRole('article')
    const first = within(cards[0]!)
    expect(first.getByText('Cheating or an illegitimate run')).toBeInTheDocument()
    expect(first.getByRole('link', { name: 'Portal Gun' })).toHaveAttribute('href', '/map/sp/47458')
    expect(first.getByRole('link', { name: 'Runner' })).toBeInTheDocument()
    // The time opens the reported run.
    expect(first.getByRole('link', { name: '22.43' })).toHaveAttribute('href', '/run/100')
    expect(first.getByText('Timer starts late')).toBeInTheDocument()
    expect(first.getByRole('link', { name: 'Video' })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=abc',
    )
    const second = within(cards[1]!)
    expect(second.getByText('Hidden')).toBeInTheDocument()
    expect(second.getByText('Pending')).toBeInTheDocument()
    expect(second.getByText('No demo')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Resolved' }))
    expect(await screen.findByText('No reports.')).toBeInTheDocument()
    expect(statuses).toEqual(['open', 'resolved'])
  })

  it('resolves a report (and the run’s other open ones) with a note', async () => {
    let open = true
    const sent: unknown[] = []
    server.use(
      http.get(`${API}/admin/reports`, () => HttpResponse.json(open ? [report({ open_on_run: 3 })] : [])),
      http.put(`${API}/admin/reports/7`, async ({ request }) => {
        sent.push(await request.json())
        open = false
        return new HttpResponse(null, { status: 200 })
      }),
    )
    await renderWithProviders(<Reports />, { user: 'moderator' })
    expect(await screen.findByText('3 open reports on this run')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /All 3 on this run/ })).toBeChecked()
    await userEvent.type(screen.getByRole('textbox', { name: 'Note' }), ' banned it ')
    await userEvent.click(screen.getByRole('button', { name: 'Resolve' }))
    expect(await screen.findByText('No open reports.')).toBeInTheDocument()
    expect(sent).toEqual([{ status: 'resolved', note: 'banned it', all_on_run: true }])
  })

  it('shows how a closed report ended, and reopens it', async () => {
    const sent: unknown[] = []
    server.use(
      http.get(`${API}/admin/reports`, () =>
        HttpResponse.json([
          report({
            status: 'dismissed',
            resolved_by_name: 'Moderator',
            resolved_at: '2026-10-17T11:00:00',
            resolution_note: 'fine',
          }),
        ]),
      ),
      http.put(`${API}/admin/reports/7`, async ({ request }) => {
        sent.push(await request.json())
        return new HttpResponse('Report not found.', { status: 404 })
      }),
    )
    await renderWithProviders(<Reports />, { user: 'moderator' })
    expect(await screen.findByText(/Dismissed by Moderator .* · “fine”/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reopen' }))
    expect(await screen.findByText('Report not found.')).toBeInTheDocument()
    expect(sent).toEqual([{ status: 'open', note: null, all_on_run: false }])
  })
})

const job = (over: Partial<BackgroundJob> = {}): BackgroundJob => ({
  key: 'steam_sync',
  name: 'Steam sync',
  enabled: true,
  schedule: 'Every 5 minutes',
  last: null,
  ...over,
})

describe('background jobs', () => {
  it('shows each job’s state and last run', async () => {
    server.use(
      http.get(`${API}/admin/jobs`, () =>
        HttpResponse.json([
          job(),
          job({
            key: 'old_boards_sync',
            name: 'Old-board pull',
            enabled: false,
            last: {
              running: false,
              started_at: '2026-10-17T10:00:00',
              finished_at: '2026-10-17T10:01:00',
              trigger: 'Admin',
              ok: false,
              summary: 'The old board did not answer.',
              dry_run: true,
            },
          }),
          job({
            key: 'demo_parse',
            name: 'Demo parsing',
            last: {
              running: true,
              started_at: '2026-10-17T10:00:00',
              finished_at: null,
              trigger: 'schedule',
              ok: null,
              summary: null,
              dry_run: false,
            },
          }),
        ]),
      ),
    )
    await renderWithProviders(<BackgroundJobs />, { user: 'admin' })
    const [steam, old, demos] = (await screen.findAllByRole('region')).map((s) => within(s))
    expect(steam!.getByText('On')).toBeInTheDocument()
    expect(steam!.getByText('Every 5 minutes')).toBeInTheDocument()
    expect(steam!.getByText('Hasn’t run since the server started.')).toBeInTheDocument()
    expect(old!.getByText('Off')).toBeInTheDocument()
    expect(old!.getByText('Not running on a schedule')).toBeInTheDocument()
    expect(old!.getByText(/^Dry run .* · by Admin$/)).toBeInTheDocument()
    expect(old!.getByText('The old board did not answer.')).toBeInTheDocument()
    expect(old!.getByRole('button', { name: 'Dry run' })).toBeInTheDocument()
    expect(demos!.getByText(/^Running… started .* on its schedule$/)).toBeInTheDocument()
    expect(demos!.getByRole('button', { name: 'Run now' })).toBeDisabled()
  })

  it('runs a job now in the background, and shows why it couldn’t start', async () => {
    const started: string[] = []
    server.use(
      http.get(`${API}/admin/jobs`, () =>
        HttpResponse.json([job(), job({ key: 'demo_parse', name: 'Demo parsing' })]),
      ),
      http.post(`${API}/admin/steam_sync`, ({ request }) => {
        started.push(new URL(request.url).search)
        return HttpResponse.json({ started: true }, { status: 202 })
      }),
      http.post(`${API}/admin/demo_parse`, ({ request }) => {
        started.push(new URL(request.url).search)
        return new HttpResponse('That job is already running.', { status: 409 })
      }),
    )
    await renderWithProviders(<BackgroundJobs />, { user: 'admin' })
    const [steam, demos] = (await screen.findAllByRole('region')).map((s) => within(s))
    await userEvent.click(steam!.getByRole('button', { name: 'Run now' }))
    await waitFor(() => expect(started).toEqual(['?background=true']))
    await userEvent.click(demos!.getByRole('button', { name: 'Run now' }))
    expect(await demos!.findByText('That job is already running.')).toBeInTheDocument()
    expect(started).toEqual(['?background=true', '?limit=200&background=true'])
  })

  it('reloads the site’s run data once a run started here has finished', async () => {
    let finished: string | null = null
    server.use(
      http.get(`${API}/admin/jobs`, () =>
        HttpResponse.json([
          job({
            last: finished
              ? {
                  running: false,
                  started_at: finished,
                  finished_at: finished,
                  trigger: 'Admin',
                  ok: true,
                  summary: '3 new times',
                  dry_run: false,
                }
              : null,
          }),
        ]),
      ),
      http.post(`${API}/admin/steam_sync`, () => {
        finished = new Date(Date.now() + 1000).toISOString().slice(0, 19)
        return HttpResponse.json({ started: true }, { status: 202 })
      }),
    )
    const { queryClient } = await renderWithProviders(<BackgroundJobs />, { user: 'admin' })
    queryClient.setQueryData(['map-board', '47458'], [])
    await userEvent.click(await screen.findByRole('button', { name: 'Run now' }))
    expect(await screen.findByText('3 new times')).toBeInTheDocument()
    await waitFor(() => expect(queryClient.getQueryState(['map-board', '47458'])?.isInvalidated).toBe(true))
  })

  it('says when the jobs can’t be loaded', async () => {
    server.use(
      http.get(
        `${API}/admin/jobs`,
        () => new HttpResponse('Only admins can see the background jobs.', { status: 403 }),
      ),
    )
    await renderWithProviders(<BackgroundJobs />, { user: 'moderator' })
    expect(
      await screen.findByText('Couldn’t load the background jobs: Only admins can see the background jobs.'),
    ).toBeInTheDocument()
  })
})
