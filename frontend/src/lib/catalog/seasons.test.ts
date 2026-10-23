import { describe, expect, it } from 'vitest'
import raw from '@/testing/fixtures/catalog.json'
import { buildCatalog } from './build'
import {
  baseBoardOf,
  baseMapOf,
  currentSeason,
  isLive,
  isSeason,
  mapLink,
  modeOf,
  seasonBoard,
  seasonFor,
  seasonMap,
  seasonOptions,
  seasonsOf,
  withSeason,
} from './seasons'
import type { CatalogRaw } from './types'

const catalog = buildCatalog(raw as CatalogRaw)
const S1 = 'portal-2-season-1'
// The fixture's season runs 2026-10-15 to 2026-10-30 23:04 UTC.
const during = Date.parse('2026-10-20T12:00:00Z')
const after = Date.parse('2026-11-05T00:00:00Z')

describe('seasons', () => {
  it('knows seasons and whether they are running', () => {
    expect(isSeason(catalog, S1)).toBe(true)
    expect(isSeason(catalog, 'portal2')).toBe(false)
    expect(isLive(catalog.games[S1], during)).toBe(true)
    expect(isLive(catalog.games[S1], after)).toBe(false)
    expect(isLive(catalog.games.portal2, during)).toBe(false)
  })

  it("lists a game's seasons and picks the current one", () => {
    expect(seasonsOf(catalog, 'portal2').map((g) => g.id)).toEqual([S1])
    expect(seasonsOf(catalog, 'mel')).toEqual([])
    expect(currentSeason(catalog, 'portal2', during)?.id).toBe(S1)
    // After it ends it's still the latest one.
    expect(currentSeason(catalog, null, after)?.id).toBe(S1)
    expect(currentSeason(catalog, 'mel', during)).toBeNull()
  })

  it('accepts ?season= only for a season of that game', () => {
    expect(seasonFor(catalog, 'portal2', S1)).toBe(S1)
    expect(seasonFor(catalog, 'mel', S1)).toBeNull()
    expect(seasonFor(catalog, 'portal2', 'portal2')).toBeNull()
    expect(seasonFor(catalog, 'portal2', null)).toBeNull()
  })

  it('translates boards between a season and its base game', () => {
    expect(modeOf(S1, `${S1}-sp`)).toBe('sp')
    expect(modeOf('portal2', 'sp')).toBe('sp')
    expect(seasonBoard(catalog, S1, 'portal2', 'coop')).toBe(`${S1}-coop`)
    expect(seasonBoard(catalog, S1, 'portal2', 'overall')).toBe('overall')
    expect(seasonBoard(catalog, S1, 'portal2', 'chapter-3')).toBeNull()
    expect(baseBoardOf(catalog, S1, `${S1}-sp`)).toBe('sp')
    expect(baseBoardOf(catalog, S1, 'overall')).toBe('overall')
    expect(baseBoardOf(catalog, 'portal2', 'sp')).toBe('sp')
  })

  it('maps between base maps and season copies', () => {
    const copy = seasonMap(catalog, S1, '47741')!
    expect(copy.id).toBe('s4-47741')
    expect(baseMapOf(catalog, copy)?.id).toBe('47741')
    expect(baseMapOf(catalog, catalog.maps.get('portal2:47741'))).toBeNull()
    expect(mapLink(catalog, copy)).toBe(`/map/coop/47741?season=${S1}`)
    expect(mapLink(catalog, catalog.maps.get('portal2:47741')!)).toBe('/map/coop/47741')
  })

  it('adds and removes ?season= keeping other parameters', () => {
    expect(withSeason('/maps', S1)).toBe(`/maps?season=${S1}`)
    expect(withSeason('/maps?game=mel', S1)).toBe(`/maps?game=mel&season=${S1}`)
    expect(withSeason(`/maps?season=${S1}&x=1`, null)).toBe('/maps?x=1')
    expect(withSeason(`/maps?season=${S1}`, null)).toBe('/maps')
  })

  it('labels the picker options', () => {
    expect(seasonOptions(catalog, 'portal2', during)).toEqual([
      { value: '', label: 'All-time' },
      { value: S1, label: 'Portal 2 Season 1 · Live' },
    ])
    expect(seasonOptions(catalog, 'portal2', after)[1]!.label).toBe('Portal 2 Season 1 · ended 2026-10-30')
  })
})
