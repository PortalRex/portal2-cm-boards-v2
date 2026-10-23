import { describe, expect, it } from 'vitest'
import { adaptChangelog } from '@/lib/adapters/runs'
import { buildCatalog, type CatalogRaw } from '@/lib/catalog'
import type { ProfileScoreRaw } from '@/lib/runs/profile-scores'
import catalogRaw from '@/testing/fixtures/catalog.json'
import changelog from '@/testing/fixtures/profile-changelog.json'
import pastRaw from '@/testing/fixtures/profile-at.json'
import pageRaw from '@/testing/fixtures/profile-page.json'
import pbsRaw from '@/testing/fixtures/profile-scores.json'
import userRaw from '@/testing/fixtures/profile-user.json'
import type { ChangelogRaw } from '@/types/runs'
import type { ProfileAtRaw, ProfilePageRaw, UserRaw } from '../types'
import { adaptProfile, profileAsOf, scoresFromRanks, splitTitles } from './profile'

const catalog = buildCatalog(catalogRaw as CatalogRaw)
const HERO = '76561198254956991'
const history = (changelog as ChangelogRaw[]).map((r) => adaptChangelog(r, 'portal2', catalog))
const profile = () =>
  adaptProfile(
    catalog,
    HERO,
    pageRaw as ProfilePageRaw,
    userRaw as UserRaw,
    history,
    pbsRaw as ProfileScoreRaw[],
  )

describe('adaptProfile', () => {
  it('reads the player from /user', () => {
    expect(profile().player).toEqual({
      profileNumber: HERO,
      name: 'hero',
      avatar: expect.stringContaining('avatars.steamstatic.com') as unknown,
      country: 'hu',
      badges: [
        { label: 'Donator', tone: 'teal' },
        { label: 'Verifier', tone: 'staff' },
      ],
      titles: ['Donator'],
      role: 'verifier',
      twitch: 'heroeen',
      youtube: '/channel/UC-SnOS5mev1CmSTVvLbFxMw',
      banned: false,
      steamName: 'hero-steam',
      nameLocked: false,
      avatarLocked: false,
      avatarCustom: false,
      legendsAt: '2024-06-10T00:00:00',
      frozen: false,
      frozenReason: null,
      steam: HERO,
    })
  })

  it('falls back to the Steam name, and marks admins red', () => {
    const p = adaptProfile(
      catalog,
      HERO,
      pageRaw as ProfilePageRaw,
      { ...(userRaw as UserRaw), board_name: null, role: 'admin', title: null },
      [],
      [],
    )
    expect(p.player.name).toBe('hero-steam')
    expect(p.player.badges).toEqual([{ label: 'Admin', tone: 'red' }])
  })

  it('reads points and places by points id (-1 sp, -2 co-op, -3 overall)', () => {
    const p = profile()
    expect(p.points).toEqual({ sp: 11582.278, coop: 9395.984, overall: 20978.26 })
    expect(p.globalRank).toEqual({ sp: 1, coop: 4, overall: 1, country: 1 })
  })

  it('works out average places, world records and best and worst place from the ranks', () => {
    const p = profile()
    expect(p.averagePlace.sp).toBeCloseTo(4.5333, 3)
    expect(p.averagePlace.coop).toBeCloseTo(3.1667, 3)
    expect(p.averagePlace.overall).toBeCloseTo(3.9259, 3)
    expect(p.worldRecords).toEqual({ sp: 6, coop: 13 })
    expect(p.best?.map.title).toBe('Laser Stairs')
    expect(p.worst).toMatchObject({ rank: 17, map: { title: 'Funnel Catch' } })
  })

  it('picks the newest and oldest of the single player and co-op runs', () => {
    const p = profile()
    expect(p.newest).toMatchObject({
      map: { title: 'Catapults' },
      score: 1205,
      timestamp: '2026-10-08T19:43:23',
    })
    expect(p.oldest).toMatchObject({ map: { title: 'Team Retrieval' }, score: 1521 })
  })

  it('leaves out a mode without runs (the server sends it empty)', () => {
    const page = pageRaw as ProfilePageRaw
    const empty = { map: '', map_name: '', score: 0, timestamp: null as unknown as string }
    const p = adaptProfile(
      catalog,
      HERO,
      { ...page, data: { ...page.data, oldest_coop: empty, newest_coop: empty } },
      userRaw as UserRaw,
      history,
      pbsRaw as ProfileScoreRaw[],
    )
    expect(p.oldest?.map.title).toBe(page.data!.oldest_sp!.map_name)
    expect(p.newest?.map.title).toBe(page.data!.newest_sp!.map_name)
  })

  it('takes times and deltas from the personal bests, and the run details from the best run', () => {
    const buttons = profile().scores['47825']!
    expect(buttons).toMatchObject({
      rank: 1,
      score: 1756,
      timestamp: '2024-04-20T14:53:47',
      deltaWr: (pbsRaw as ProfileScoreRaw[]).find((p) => p.map_id === '47825')!.delta_to_wr,
      changelogId: 286767,
      demoId: 111780,
      note: 'Bexc',
      partner: { name: 'Rex' },
    })
    expect(buttons.points).toBeGreaterThan(0)
  })

  it('without a personal best, uses the latest run on the map (any run, as legacy)', () => {
    const gelMaze = profile().scores['52759']!
    expect(gelMaze).toMatchObject({ rank: 1, score: 2015, changelogId: 350307, partner: { name: 'Bexc' } })
    expect(gelMaze.deltaWr).toBeNull()
  })

  it('has a rank but no time on maps without any run', () => {
    const p = profile()
    expect(Object.keys(p.scores)).toHaveLength(108)
    const laserStairs = p.scores['47736']!
    expect(laserStairs).toMatchObject({ rank: 1, score: null, timestamp: null, partner: null })
  })
})

describe('scoresFromRanks', () => {
  it("skips maps the game doesn't have", () => {
    expect(scoresFromRanks(catalog, HERO, { '1': 2, '999999': 3 }, [], 'mel')).toEqual({
      '1': expect.objectContaining({
        rank: 2,
        map: expect.objectContaining({ game: 'mel' }) as unknown,
      }) as unknown,
    })
  })
})

describe('splitTitles', () => {
  it("splits the old boards' title field", () => {
    expect(splitTitles('Original Developer, Donator; Mapper ')).toEqual([
      'Original Developer',
      'Donator',
      'Mapper',
    ])
    expect(splitTitles(null)).toEqual([])
  })
})

describe('profileAsOf', () => {
  it('shows points, places and best times at the end of a past day, and the history until then', () => {
    const p = profileAsOf(catalog, profile(), pastRaw as ProfileAtRaw, '2024-01-01')
    expect(p.asOf).toBe('2024-01-01')
    expect(p.points).toEqual({ sp: 11579, coop: 9415.5, overall: 20994.5 })
    expect(p.globalRank).toEqual({ sp: 3, coop: 3, overall: 1, country: 1 })
    expect(Object.keys(p.scores)).toHaveLength(8)
    expect(p.averagePlace.overall).toBe(5)
    expect(p.worldRecords).toEqual({ sp: 0, coop: 0 })
    expect(p.history.map((h) => h.id)).toEqual([252471, 217821, 213262])
    expect(p.newest?.map.title).toBe('Laser Crusher')
    expect(p.oldest?.map.title).toBe('Doors')
    // Details come from the run the server names.
    expect(p.scores['45467']).toMatchObject({
      rank: 3,
      changelogId: 252471,
      demoId: 85610,
      partner: { name: 'Rex' },
    })
    expect(p.player).toEqual(profile().player)
  })
})
