import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import changelog from '@/testing/fixtures/changelog.json'
import { sampleChangelog } from '@/testing/data/sample'
import { API } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { renderRoute } from '@/testing/test-utils'
import type { ChangelogRaw } from '@/types/runs'

// Score Updates through the real route (search params, loaders) with the API mocked.
function serve(rows: ChangelogRaw[] = changelog as ChangelogRaw[]) {
  const requests: URLSearchParams[] = []
  server.use(
    http.get(`${API}/changelog`, ({ request }) => {
      requests.push(new URL(request.url).searchParams)
      return HttpResponse.json(rows)
    }),
  )
  return requests
}

const table = () => screen.getByRole('table', { name: 'Score updates' })
const rowFor = async (map: string) =>
  (await within(table()).findByRole('link', { name: map })).closest('[data-testid=score-row]') as HTMLElement

describe('Score Updates', () => {
  it('lists the latest runs with their ranks, map, players, time and points', async () => {
    serve()
    await renderRoute('/')
    const first = changelog[0]!
    const row = await rowFor(first.map_name)
    expect(within(row).getByRole('link', { name: first.user_name })).toHaveAttribute(
      'href',
      `/profile/${first.profile_number}`,
    )
    expect(within(row).getByTestId('rank-after')).toHaveTextContent(String(first.post_rank))
    expect(
      within(table())
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Previous', 'New', 'Map', 'Player(s)', 'Time', 'ΔTime', 'ΔPoints', 'Date'])
  })

  it('shows pending and banned runs with their status', async () => {
    serve()
    await renderRoute('/?banned=show')
    expect(await within(table()).findAllByRole('img', { name: 'Pending' })).not.toHaveLength(0)
    expect(within(table()).getAllByRole('img', { name: 'Banned' })).not.toHaveLength(0)
  })

  it('shows the unknown partner of an unpaired co-op run without a link', async () => {
    serve()
    await renderRoute('/')
    const partner = await within(table()).findByText('Unknown partner')
    const row = partner.closest('[data-testid=score-row]') as HTMLElement
    expect(within(row).getByRole('link', { name: 'Snow' })).toBeInTheDocument()
    expect(within(row).queryByRole('link', { name: 'Unknown partner' })).toBeNull()
  })

  it('marks who set a PB with a co-op run with a trophy, or their name with the "Coloured name" setting', async () => {
    serve()
    await renderRoute('/')
    const row = await rowFor('Catapult Block')
    expect(within(row).getAllByRole('img', { name: 'PB' })).toHaveLength(1)
  })

  it('keeps the filters in the URL, sends them to the server and clears them', async () => {
    const requests = serve()
    const { router } = await renderRoute('/')
    await within(table()).findAllByRole('row')
    await userEvent.click(screen.getByRole('radio', { name: 'Cooperative' }))
    await userEvent.click(screen.getByRole('button', { name: 'World records' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ mode: 'coop', wr: '1' }))
    await waitFor(() => expect(requests.at(-1)?.get('wr_gain')).toBe('true'))
    expect(requests.at(-1)?.get('coop')).toBe('true')
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(router.state.location.search).toEqual({}))
  })

  it('opens a shared link with its filters', async () => {
    const requests = serve()
    await renderRoute('/?mode=sp&limit=500&rank=10&days=7&banned=only')
    await waitFor(() => expect(requests.length).toBeGreaterThan(0))
    expect(Object.fromEntries(requests.at(-1)!)).toMatchObject({
      limit: '500',
      coop: 'false',
      max_rank: '10',
      since_days: '7',
      banned: 'true',
    })
    expect(requests.at(-1)!.has('sp')).toBe(false)
    expect(screen.getByRole('combobox', { name: 'Number of runs' })).toHaveValue('500')
  })

  it('searches players after a pause', async () => {
    const requests = serve()
    await renderRoute('/')
    await within(table()).findAllByRole('row')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search players' }), 'snow')
    await waitFor(() => expect(requests.at(-1)?.get('nick_name')).toBe('snow'))
  })

  it('lists the matching players to pick one, then shows just their runs', async () => {
    const requests = serve()
    const snow = '76561198842803939'
    server.use(
      http.get(`${API}/users/search`, () =>
        HttpResponse.json([
          { profile_number: snow, user_name: 'Snow', avatar: null, runs: 1166 },
          { profile_number: '76561199081871175', user_name: 'Snow Cat', avatar: null, runs: 177 },
        ]),
      ),
    )
    const { router } = await renderRoute('/')
    await within(table()).findAllByRole('row')
    const box = screen.getByRole('searchbox', { name: 'Search players' })
    expect(box).toHaveAttribute('autocomplete', 'off')
    await userEvent.type(box, 'snow')
    const list = await screen.findByRole('list', { name: 'Matching players' })
    expect(await within(list).findByText('1166 runs')).toBeInTheDocument()
    await userEvent.click(within(list).getAllByRole('button')[0]!)
    // The list closes, the box shows the name, and the feed asks for that player by Steam id.
    expect(screen.queryByRole('list', { name: 'Matching players' })).not.toBeInTheDocument()
    expect(box).toHaveValue('Snow')
    expect(router.state.location.search).toMatchObject({ q: 'Snow', player: snow })
    await waitFor(() => expect(requests.at(-1)?.get('profile_number')).toBe(snow))
    expect(requests.at(-1)?.get('nick_name')).toBeNull()
    // Typing again goes back to searching names.
    await userEvent.type(box, 'x')
    await waitFor(() => expect(router.state.location.search).toEqual({ q: 'Snowx' }))
  })

  it("folds a player's session of PBs on a map into one row, listing the earlier ones when opened", async () => {
    const base = (changelog as ChangelogRaw[])[0]!
    const other = (changelog as ChangelogRaw[])[1]!
    // Three PBs an hour apart, with someone else's run between them.
    const pb = (id: number, hour: number, score: number, pre: number, post: number) => ({
      ...base,
      id,
      timestamp: `2026-10-17T${hour}:00:00`,
      score,
      pre_rank: pre,
      post_rank: post,
      score_delta: -10,
    })
    serve([
      pb(3, 22, 7206, 304, 297),
      { ...other, timestamp: '2026-10-17T21:30:00' },
      pb(2, 21, 7216, 320, 304),
      pb(1, 20, 7226, 350, 320),
    ])
    await renderRoute('/')
    const row = await rowFor(base.map_name)
    expect(within(table()).getAllByRole('link', { name: base.map_name })).toHaveLength(1)
    expect(row).toHaveTextContent('+2 earlier PBs')
    // The session as a whole: from the rank before its first PB, and the time all three took off.
    expect(within(row).getByTestId('rank-after')).toHaveTextContent('297')
    expect(row).toHaveTextContent('350')
    expect(row).toHaveTextContent('-0.30s')

    await userEvent.click(within(row).getByRole('button', { name: 'Show details' }))
    const earlier = within(row).getByRole('list', { name: 'Earlier PBs this session' })
    expect(
      within(earlier)
        .getAllByRole('link')
        .map((a) => [a.textContent, a.getAttribute('href')]),
    ).toEqual([
      ['1:12.16', '/run/2'],
      ['1:12.26', '/run/1'],
    ])
  })

  it('pages through the runs, 20 at a time', async () => {
    serve(sampleChangelog({ limit: '45' }))
    const { router } = await renderRoute('/')
    await within(table()).findAllByRole('link', { name: /./ })
    const rows = () => table().querySelectorAll('[data-testid=score-row]')
    expect(rows()).toHaveLength(20)
    await userEvent.click(screen.getAllByRole('button', { name: '3' })[0]!)
    await waitFor(() => expect(router.state.location.search).toEqual({ page: '2' }))
    expect(rows()).toHaveLength(5)
  })

  it('says when nothing matches, and when the server is down', async () => {
    serve([])
    await renderRoute('/?wr=1')
    expect(await screen.findByText('No score updates match these filters.')).toBeInTheDocument()
  })

  it('shows an error state instead of sample data when the API fails', async () => {
    server.use(
      http.get(`${API}/changelog`, () =>
        HttpResponse.json({ error: 'Something went wrong on the server.' }, { status: 500 }),
      ),
    )
    await renderRoute('/')
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on the server.')
  })

  it('has no like or dislike buttons on the rows', async () => {
    serve()
    await renderRoute('/', { user: 'player' })
    const row = await rowFor(changelog[0]!.map_name)
    expect(within(row).queryByRole('button', { name: /thumbs (up|down)/i })).toBeNull()
  })

  it("opens a player's history on the map from the time", async () => {
    serve()
    const first = changelog[0]!
    await renderRoute('/')
    const row = await rowFor(first.map_name)
    await userEvent.click(within(row).getByRole('button', { name: /^\d/ }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(`${first.user_name} on ${first.map_name}`)
    expect(await within(dialog).findAllByRole('row')).not.toHaveLength(0)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('opens Run Details under the row (the route fills the slot)', async () => {
    serve()
    server.use(http.get(`${API}/changelog/:id/segments`, () => HttpResponse.json([])))
    const first = changelog[0]!
    await renderRoute('/')
    const row = await rowFor(first.map_name)
    await userEvent.click(within(row).getByRole('button', { name: 'Show details' }))
    expect(await within(row).findByText('SAR Version:')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Hide details' })).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(within(row).getByRole('button', { name: 'Hide details' }))
    expect(within(row).queryByText('SAR Version:')).toBeNull()
  })
})
