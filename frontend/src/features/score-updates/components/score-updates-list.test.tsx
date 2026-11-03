import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import changelog from '@/testing/fixtures/changelog.json'
import { sampleChangelog } from '@/testing/data/sample'
import { scrollIntoViewAll } from '@/testing/intersection'
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

  it("puts the map's name on glass in the new rank's colour, plain for a run without a rank", async () => {
    const [first, second] = changelog as ChangelogRaw[]
    serve([first!, { ...second!, post_rank: null }])
    await renderRoute('/')
    const glass = (map: string) =>
      within(table()).getByRole('link', { name: map }).closest('.map-glass') as HTMLElement
    await rowFor(first!.map_name)
    expect(glass(first!.map_name)).toHaveAttribute('data-tint')
    // The cell carries the rank's colours for the glass (rankVars).
    expect(glass(first!.map_name).parentElement!.style.getPropertyValue('--rank-color')).not.toBe('')
    expect(glass(second!.map_name)).not.toHaveAttribute('data-tint')
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

  it('marks who set a PB with a co-op run by their name in colour, or a trophy with the "Trophy" setting', async () => {
    serve()
    const { unmount } = await renderRoute('/')
    const row = await rowFor('Catapult Block')
    expect(within(row).queryByRole('img', { name: 'PB' })).toBeNull()
    expect(row.querySelectorAll('a[style*="--pb-rgb"]')).toHaveLength(1)
    unmount()
    localStorage.setItem('p2cm.coopPbStyle', 'icon')
    await renderRoute('/')
    const withTrophy = await rowFor('Catapult Block')
    expect(within(withTrophy).getAllByRole('img', { name: 'PB' })).toHaveLength(1)
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
    await renderRoute('/?mode=sp&rank=10&days=7&banned=only')
    await waitFor(() => expect(requests.length).toBeGreaterThan(0))
    expect(Object.fromEntries(requests.at(-1)!)).toMatchObject({
      limit: '200',
      coop: 'false',
      max_rank: '10',
      since_days: '7',
      banned: 'true',
    })
    expect(requests.at(-1)!.has('sp')).toBe(false)
    // The list goes on as it scrolls: no number of runs to pick.
    expect(screen.queryByRole('combobox', { name: 'Number of runs' })).toBeNull()
  })

  it('fetches older runs, after the last one it has, when the loaded ones run out', async () => {
    // 200 runs, then 30 more after the last of them (each by another player, so none fold together).
    const base = (changelog as ChangelogRaw[]).find((r) => r.coop_id == null)!
    const runs = Array.from({ length: 230 }, (_, i) => ({
      ...base,
      id: 900000 - i,
      previous_id: null,
      profile_number: String(76561190000000000n + BigInt(i)),
      user_name: `Player ${i}`,
    }))
    const requests: URLSearchParams[] = []
    server.use(
      http.get(`${API}/changelog`, ({ request }) => {
        const params = new URL(request.url).searchParams
        requests.push(params)
        const before = params.get('before')
        const from = before ? runs.findIndex((r) => String(r.id) === before) + 1 : 0
        return HttpResponse.json(runs.slice(from, from + Number(params.get('limit'))))
      }),
    )
    await renderRoute('/')
    await within(table()).findAllByRole('link', { name: /./ })
    expect(requests).toHaveLength(1)
    const rows = () => table().querySelectorAll('[data-testid=score-row]').length
    // Scroll until the second page has come and everything shows.
    for (let i = 0; i < 30 && screen.queryByTestId('score-updates-more'); i++) {
      act(() => scrollIntoViewAll())
      await waitFor(() => expect(rows() > 0).toBe(true))
    }
    await waitFor(() => expect(screen.queryByTestId('score-updates-more')).toBeNull())
    expect(requests).toHaveLength(2)
    expect(requests[1]!.get('before')).toBe(String(runs[199]!.id))
    // Rendering 200-odd rows takes jsdom a few seconds, more under the full suite's load.
  }, 20_000)

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
    const items = within(earlier).getAllByRole('listitem')
    expect(items.map((li) => within(li).getByText(/^1:12\.\d\d$/).textContent)).toEqual([
      '1:12.16',
      '1:12.26',
    ])
    // Each opens its own run details under it, with its ranks as the rows show them.
    expect(within(items[0]!).getByTestId('rank-before')).toHaveTextContent('320')
    server.use(http.get(`${API}/changelog/:id/segments`, () => HttpResponse.json([])))
    await userEvent.click(within(items[0]!).getByRole('button', { name: 'Show details' }))
    expect(await within(items[0]!).findByText('SAR Version:')).toBeInTheDocument()
  })

  it('shows 20 more runs each time the end of the list scrolls near, and starts over on new filters', async () => {
    serve(sampleChangelog({ limit: '45' }))
    await renderRoute('/')
    await within(table()).findAllByRole('link', { name: /./ })
    const rows = () => table().querySelectorAll('[data-testid=score-row]')
    expect(rows()).toHaveLength(20)
    expect(screen.queryByRole('navigation', { name: /pagination/i })).toBeNull()
    act(() => scrollIntoViewAll())
    await waitFor(() => expect(rows()).toHaveLength(40))
    act(() => scrollIntoViewAll())
    await waitFor(() => expect(rows()).toHaveLength(45))
    // All of them: nothing more to watch for.
    expect(screen.queryByTestId('score-updates-more')).toBeNull()
    await userEvent.click(screen.getByRole('radio', { name: 'Singleplayer' }))
    await waitFor(() => expect(rows().length).toBeLessThanOrEqual(20))
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

  it('opens a co-op run on the POV of the player whose side was clicked', async () => {
    serve()
    const run = (changelog as ChangelogRaw[]).find((r) => r.coop_id === 68238)!
    const half = (n: 1 | 2) => ({
      profile_number: n === 1 ? run.blue_profile_number : run.orange_profile_number,
      user_name: n === 1 ? run.blue_name : run.orange_name,
      avatar: null,
      is_host: n === 1,
      changelog_id: run.id + n - 1,
      score: run.score,
      timestamp: run.timestamp,
      note: null,
      youtube_id: null,
      autorender_id: null,
      demo_id: 50 + n,
      has_segments: false,
      portals: null,
      sar_version: null,
    })
    server.use(
      http.get(`${API}/coop/${run.coop_id}/halves`, () => HttpResponse.json([half(1), half(2)])),
      http.get(`${API}/changelog/:id/segments`, () => HttpResponse.json([])),
    )
    await renderRoute('/')
    const row = (await within(table()).findByRole('link', { name: run.orange_name! })).closest(
      '[data-testid=score-row]',
    ) as HTMLElement
    // The two sides, found before the details (with the same names) open.
    const [blue, orange] = [run.blue_name!, run.orange_name!].map((name) =>
      within(row).getByRole('link', { name }).closest('[data-pov]')!,
    )
    const selected = async (name: string) =>
      expect(await within(row).findByRole('tab', { name, selected: true })).toBeInTheDocument()

    await userEvent.click(orange!)
    await selected(run.orange_name!)
    // The other side of the open row switches to that player; their side again closes it.
    await userEvent.click(blue!)
    await selected(run.blue_name!)
    await userEvent.click(blue!)
    expect(within(row).getByRole('button', { name: 'Show details' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })
})
