import { describe, expect, it } from 'vitest'
import raw from '@/testing/fixtures/catalog.json'
import { BUILTIN_CATALOG, buildCatalog } from './build'
import {
  chapterDbId,
  chaptersFor,
  findMap,
  gameForMode,
  gameIdParam,
  getMap,
  isMultiplayerMode,
  mapPath,
  mapsForGame,
  mapsForMode,
  modeLabel,
  p2ChapterByDbId,
  p2Chapters,
  pickableGames,
} from './selectors'
import type { CatalogRaw } from './types'

const catalog = buildCatalog(raw as CatalogRaw)

describe('catalog selectors', () => {
  it('finds the game of a board, falling back like legacy for unknown boards', () => {
    expect(gameForMode(catalog, 'coop')).toBe('portal2')
    expect(gameForMode(catalog, 'custom-game-sp')).toBe('custom-game')
    expect(gameForMode(BUILTIN_CATALOG, 'advanced')).toBe('mel')
    expect(gameForMode(BUILTIN_CATALOG, 'nope')).toBe('portal2')
    expect(isMultiplayerMode(catalog, 'coop')).toBe(true)
    expect(modeLabel(catalog, 'story')).toBe('Story Mode')
  })

  it('lists chapters and maps per board and game', () => {
    expect(chaptersFor(catalog, 'sp')).toHaveLength(9)
    expect(chaptersFor(catalog, 'nope')).toBe(chaptersFor(catalog, 'sp'))
    expect(mapsForMode(catalog, 'coop')).toHaveLength(48)
    expect(mapsForGame(catalog, 'portal2')).toHaveLength(108)
    expect(mapsForGame(catalog, 'mel')).toHaveLength(40)
    expect(mapsForGame(catalog, 'nope')).toEqual([])
  })

  it('looks maps up by id within a game, or in any game', () => {
    expect(getMap(catalog, '47741')?.title).toBe('Doors')
    expect(getMap(catalog, 47741)?.title).toBe('Doors')
    expect(getMap(catalog, '1', 'mel')?.title).toBe('Tramride')
    expect(getMap(catalog, '1')).toBeUndefined()
    expect(findMap(catalog, 'g3-2')?.game).toBe('custom-game')
    expect(findMap(catalog, 'missing')).toBeUndefined()
    expect(mapPath({ mode: 'coop', id: '47741' })).toBe('/map/coop/47741')
  })

  it('works out Portal 2 chapter database ids', () => {
    expect(chapterDbId({ mode: 'coop', number: 2 })).toBe(2)
    expect(chapterDbId({ mode: 'sp', number: 1 })).toBe(7)
    expect(chapterDbId({ mode: 'sp', number: 1, dbId: 40 })).toBe(40)
    expect(p2Chapters(BUILTIN_CATALOG).map((c) => chapterDbId(c))).toEqual([
      7, 8, 9, 10, 11, 12, 13, 14, 15, 1, 2, 3, 4, 5, 6,
    ])
    expect(p2ChapterByDbId(catalog, '9')?.name).toBe('The Return')
  })

  it('offers only visible games (not seasons) in the banner', () => {
    expect(pickableGames(catalog).map((g) => g.id)).toEqual(['portal2', 'mel', 'custom-game'])
  })

  it('sends game_id for every game but Portal 2', () => {
    expect(gameIdParam(catalog, 'portal2')).toEqual({})
    expect(gameIdParam(catalog, null)).toEqual({})
    expect(gameIdParam(catalog, 'mel')).toEqual({ game_id: 2 })
    expect(gameIdParam(catalog, 'portal-2-season-1')).toEqual({ game_id: 4 })
    expect(gameIdParam(catalog, 'unknown')).toEqual({})
  })
})
