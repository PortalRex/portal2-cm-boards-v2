import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG, buildCatalog, type CatalogRaw } from '@/lib/catalog'
import catalogRaw from '@/testing/fixtures/catalog.json'
import pointsSp from '@/testing/fixtures/points-sp.json'
import type { PointsWrapperRaw } from '../types'
import { adaptPoints, serverBoard } from './points'

const catalog = buildCatalog(catalogRaw as CatalogRaw)
const fixture = pointsSp as PointsWrapperRaw

describe('adaptPoints', () => {
  it('ranks everyone by points, most first', () => {
    const { points } = adaptPoints(fixture, 60)
    expect(points.map((r) => r.player.name)).toEqual([
      'hero',
      'AngerySnek',
      'Flaming Bag',
      'Rex',
      'Super82553',
      'Unknown',
    ])
    expect(points[0]).toEqual({
      player: {
        profileNumber: '76561198254956991',
        name: 'hero',
        avatar: expect.stringContaining('avatars.steamstatic.com') as unknown,
        country: 'hu',
      },
      points: 11582.278,
      score: 235083,
      numScores: 60,
    })
  })

  it('times only players with a time on every map, fastest first', () => {
    const { times, mapCount } = adaptPoints(fixture, 60)
    expect(mapCount).toBe(60)
    expect(times.map((r) => r.player.name)).toEqual(['hero', 'AngerySnek', 'Flaming Bag', 'Super82553'])
  })

  it('reads country ids as country codes, and no country as null', () => {
    const { points } = adaptPoints(fixture, 60)
    expect(points.find((r) => r.player.name === 'Rex')!.player.country).toBeNull()
    expect(points.find((r) => r.player.name === 'Flaming Bag')!.player.country).not.toBeNull()
  })

  it('gives empty boards for no answer', () => {
    expect(adaptPoints(null, 0)).toEqual({ points: [], times: [], mapCount: 0 })
  })
})

describe('serverBoard', () => {
  it("keeps legacy's map counts for the built-in boards", () => {
    expect(serverBoard(catalog, { game: 'portal2', board: 'overall' })).toEqual({
      gameId: 1,
      board: 'overall',
      mapCount: 108,
    })
    expect(serverBoard(catalog, { game: 'portal2', board: 'sp' })?.mapCount).toBe(60)
    expect(serverBoard(catalog, { game: 'portal2', board: 'coop' })?.mapCount).toBe(48)
    expect(serverBoard(catalog, { game: 'mel', board: 'overall' })).toEqual({
      gameId: 2,
      board: 'overall',
      mapCount: 40,
    })
    expect(serverBoard(catalog, { game: 'mel', board: 'story' })?.mapCount).toBe(22)
    expect(serverBoard(catalog, { game: 'mel', board: 'advanced' })?.mapCount).toBe(18)
  })

  it("counts a Portal 2 chapter's maps", () => {
    expect(serverBoard(catalog, { game: 'portal2', board: 'chapter-7' })).toEqual({
      gameId: 1,
      board: 'chapter-7',
      mapCount: 9,
    })
    expect(serverBoard(catalog, { game: 'portal2', board: 'chapter-99' })?.mapCount).toBe(0)
  })

  it("asks for other games' boards by the chapters' game_mode", () => {
    expect(serverBoard(catalog, { game: 'custom-game', board: 'custom-game-sp' })).toEqual({
      gameId: 3,
      board: 'sp',
      mapCount: 3,
    })
    expect(serverBoard(catalog, { game: 'custom-game', board: 'overall' })?.mapCount).toBe(3)
    expect(serverBoard(catalog, { game: 'portal-2-season-1', board: 'portal-2-season-1-sp' })).toEqual({
      gameId: 4,
      board: 'sp',
      mapCount: 60,
    })
  })

  it('has no board for a game the catalog does not know', () => {
    expect(serverBoard(BUILTIN_CATALOG, { game: 'custom-game', board: 'overall' })).toBeNull()
  })
})
