import { describe, expect, it } from 'vitest'
import raw from '@/testing/fixtures/catalog.json'
import { BUILTIN_CATALOG, buildCatalog } from './build'
import {
  baseGame,
  builtInBranding,
  gameBoardPath,
  gameBoardsPath,
  gameBranding,
  gameFromLocation,
  selectedGame,
} from './games'
import type { CatalogRaw } from './types'

const catalog = buildCatalog(raw as CatalogRaw)
const S1 = 'portal-2-season-1'

describe('gameFromLocation', () => {
  it.each([
    ['/', '?game=mel', 'mel'],
    ['/', `?game=${S1}`, 'portal2'],
    ['/', '?game=nope', null],
    ['/leaderboard/mel/story', '', 'mel'],
    ['/leaderboard/mel', '', 'mel'],
    ['/leaderboard/game/custom-game/overall', '', 'custom-game'],
    [`/leaderboard/game/${S1}/overall`, '', 'portal2'],
    ['/leaderboard/game/nope/overall', '', null],
    ['/leaderboard/overall', '', 'portal2'],
    ['/leaderboard/chapter/3', '', 'portal2'],
    ['/map/story/5', '', 'mel'],
    ['/map/custom-game-sp/g3-1', '', 'custom-game'],
    [`/map/${S1}-coop/s4-47741`, '', 'portal2'],
    ['/map/nope/1', '', null],
    ['/maps', '', null],
    ['/profile/1', '', null],
  ])('%s%s -> %s', (pathname, search, game) => {
    expect(gameFromLocation(catalog, pathname, search)).toBe(game)
  })

  it('lets ?game= win over the path', () => {
    expect(gameFromLocation(catalog, '/leaderboard/overall', '?game=mel')).toBe('mel')
  })
})

describe('selectedGame', () => {
  it('prefers the address, then the saved choice, then Portal 2', () => {
    expect(selectedGame(catalog, 'mel', 'custom-game')).toBe('mel')
    expect(selectedGame(catalog, null, 'custom-game')).toBe('custom-game')
    expect(selectedGame(catalog, null, S1)).toBe('portal2')
    expect(selectedGame(catalog, null, 'deleted-game')).toBe('portal2')
    expect(selectedGame(catalog, null, null)).toBe('portal2')
  })

  it('maps seasons to their base game', () => {
    expect(baseGame(catalog, S1)).toBe('portal2')
    expect(baseGame(BUILTIN_CATALOG, 'mel')).toBe('mel')
    expect(baseGame(catalog, null)).toBeNull()
  })
})

describe('branding', () => {
  it('uses the built-in logo and name unless the games editor set them', () => {
    expect(builtInBranding('portal2')).toMatchObject({ brand: 'P2CM', background: null })
    expect(builtInBranding('mel').brand).toBe('PSM:CM')
    expect(builtInBranding('mel').logo).toMatch(/psmcm/)
    expect(gameBranding(catalog, 'custom-game').brand).toBe('P2CM')
    const branded = buildCatalog([{ ...(raw as CatalogRaw)[1]!, short_name: 'MEL', background_version: 9 }])
    expect(gameBranding(branded, 'mel')).toMatchObject({
      brand: 'MEL',
      background: 'http://localhost:3000/api/v1/games/2/images/background?v=9',
    })
    expect(gameBranding(branded, 'mel').logo).toMatch(/psmcm/)
  })
})

describe('board paths', () => {
  it('keeps the old addresses for Portal 2 and Mel', () => {
    expect(gameBoardPath('portal2', 'sp')).toBe('/leaderboard/sp')
    expect(gameBoardsPath('mel')).toBe('/leaderboard/mel/overall')
    expect(gameBoardPath('custom-game', 'custom-game-sp')).toBe(
      '/leaderboard/game/custom-game/custom-game-sp',
    )
  })
})
