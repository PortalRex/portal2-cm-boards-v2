import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { fetchShareIds, formatSegments, renderRequestUrl, videoLinks } from '@/lib/autorender'
import { buildCatalog, type CatalogRaw } from '@/lib/catalog'
import catalogRaw from '@/testing/fixtures/catalog.json'
import changelog from '@/testing/fixtures/changelog.json'
import { API, AUTORENDER } from '@/testing/mocks/handlers'
import { server } from '@/testing/mocks/server'
import { changelogParams, getChangelog } from './changelog'
import { runVideo } from './video'

const catalog = buildCatalog(catalogRaw as CatalogRaw)

describe('changelogParams', () => {
  it('maps the filters to the API parameters like legacy', () => {
    expect(changelogParams({}, catalog)).toEqual({
      limit: 200,
      nick_name: undefined,
      profile_number: undefined,
      chamber: undefined,
      sp: undefined,
      coop: undefined,
      wr_gain: undefined,
      yt: undefined,
      has_demo: undefined,
      verified: undefined,
      banned: false,
      max_rank: undefined,
      since_days: undefined,
    })
    expect(
      changelogParams(
        {
          mode: 'coop',
          wr: true,
          video: true,
          demo: true,
          pending: true,
          banned: 'only',
          rank: '10',
          days: '7',
          search: 'zyp',
        },
        catalog,
      ),
    ).toMatchObject({
      sp: false,
      coop: true,
      wr_gain: true,
      yt: true,
      has_demo: true,
      verified: false,
      banned: true,
      max_rank: '10',
      since_days: '7',
      nick_name: 'zyp',
    })
    expect(changelogParams({ mode: 'sp', banned: 'show' }, catalog)).toMatchObject({
      coop: false,
      banned: undefined,
    })
  })

  it('sends game_id for every game but Portal 2', () => {
    expect(changelogParams({ game: 'portal2' }, catalog)).not.toHaveProperty('game_id')
    expect(changelogParams({ game: 'mel' }, catalog)).toMatchObject({ game_id: 2 })
  })
})

describe('getChangelog', () => {
  it('loads and adapts the runs, sending the filters', async () => {
    let params: URLSearchParams | undefined
    server.use(
      http.get(`${API}/changelog`, ({ request }) => {
        params = new URL(request.url).searchParams
        return HttpResponse.json(changelog)
      }),
    )
    const runs = await getChangelog({ game: 'mel', limit: 100, profileNumber: '765', mapId: '5' }, catalog)
    expect(runs).toHaveLength(changelog.length)
    expect(Object.fromEntries(params!)).toEqual({
      limit: '100',
      profile_number: '765',
      chamber: '5',
      banned: 'false',
      game_id: '2',
    })
  })

  it("filters Mel's boards by their maps (the server only knows single player and co-op)", async () => {
    server.use(http.get(`${API}/changelog`, () => HttpResponse.json(changelog)))
    const story = await getChangelog({ game: 'mel', mode: 'story' }, catalog)
    const advanced = await getChangelog({ game: 'mel', mode: 'advanced' }, catalog)
    expect(story.every((r) => r.map.mode === 'story')).toBe(true)
    expect(advanced.every((r) => r.map.mode === 'advanced')).toBe(true)
    // The fixture's one Mel run is on one of the two boards.
    expect(story.length + advanced.length).toBe(1)
  })

  it('gives an empty list and throws the server error', async () => {
    server.use(http.get(`${API}/changelog`, () => HttpResponse.json([])))
    expect(await getChangelog({}, catalog)).toEqual([])
    server.use(
      http.get(`${API}/changelog`, () => HttpResponse.json({ error: 'Not found.' }, { status: 404 })),
    )
    await expect(getChangelog({}, catalog)).rejects.toMatchObject({ status: 404 })
  })
})

describe('autorender', () => {
  it('builds the video and render links', () => {
    expect(videoLinks('abcdefghijk')).toEqual({
      src: 'https://portal2.fsn1.your-objectstorage.com/abcdefghijk.mp4',
      sources: [
        'https://portal2.fsn1.your-objectstorage.com/abcdefghijk.mp4',
        `${AUTORENDER}/storage/videos/abcdefghijk`,
      ],
      page: `${AUTORENDER}/videos/abcdefghijk`,
    })
    expect(renderRequestUrl('mel', 12)).toBe(`${AUTORENDER}/render/mel/12`)
    expect(renderRequestUrl('custom', 12)).toBe(`${AUTORENDER}/render/portal2/12`)
  })

  it('looks up share ids of rendered Portal 2 runs', async () => {
    let asked: unknown
    server.use(
      http.post(`${AUTORENDER}/api/v1/check-videos-exist`, async ({ request }) => {
        asked = await request.json()
        return HttpResponse.json({ ids: [5] })
      }),
      http.head(`${AUTORENDER}/api/v1/video/5/video`, () =>
        HttpResponse.redirect(`${AUTORENDER}/videos/abcdefghijk`, 302),
      ),
      http.head(`${AUTORENDER}/videos/abcdefghijk`, () => new HttpResponse(null, { status: 200 })),
    )
    const ids = await fetchShareIds([5, 6, 5])
    expect(asked).toEqual({ ids: [5, 6] })
    expect([...ids]).toEqual([[5, 'abcdefghijk']])
    expect(await fetchShareIds([1], 'mel')).toEqual(new Map())
  })

  it('knows when a run has a video, or can be rendered', () => {
    expect(runVideo({ id: 1, autorenderId: 'abcdefghijk' }, 'portal2')).toMatchObject({ ready: true })
    expect(runVideo({ id: 2 }, 'portal2', new Map([[2, 'zzzzzzzzzzz']]))).toMatchObject({
      ready: true,
      page: `${AUTORENDER}/videos/zzzzzzzzzzz`,
    })
    expect(runVideo({ id: 3, demoId: 9 }, 'portal2')).toEqual({
      ready: false,
      render: `${AUTORENDER}/render/portal2/3`,
    })
    expect(runVideo({ id: 4 }, 'portal2')).toEqual({ ready: false, render: null })
  })

  it('formats mtrigger segments with running totals', () => {
    expect(
      formatSegments(
        [
          { name: 'Doors - Start', ticks: 60 },
          {
            name: 'Exit',
            ticks: 30,
            splits: [
              { name: 'a', ticks: 10 },
              { name: 'Doors - b', ticks: 20 },
            ],
          },
        ],
        'Doors',
      ),
    ).toEqual([
      { name: 'Start', ticks: 60, seconds: 1, totalTicks: 60, total: 1, splits: [] },
      {
        name: 'Exit',
        ticks: 30,
        seconds: 0.5,
        totalTicks: 90,
        total: 1.5,
        splits: [
          { name: 'a', ticks: 10 },
          { name: 'b', ticks: 20 },
        ],
      },
    ])
    expect(formatSegments([], 'Doors')).toBeNull()
  })
})
