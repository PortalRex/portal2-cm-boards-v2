import { describe, expect, it } from 'vitest'
import raw from '@/testing/fixtures/catalog.json'
import { BUILTIN_CATALOG, buildCatalog, builtInImage, defaultModeLabel, gameKey } from './build'
import type { CatalogRaw } from './types'

const catalog = buildCatalog(raw as CatalogRaw)

describe('built-in catalog', () => {
  it('has Portal 2 and Mel with the legacy boards and map counts', () => {
    expect(Object.keys(BUILTIN_CATALOG.games)).toEqual(['portal2', 'mel'])
    const count = (mode: string) => BUILTIN_CATALOG.chaptersByMode[mode]!.flatMap((c) => c.maps).length
    expect([count('sp'), count('coop'), count('story'), count('advanced')]).toEqual([60, 48, 22, 18])
    expect(BUILTIN_CATALOG.games.mel!.dbId).toBe(2)
    expect(BUILTIN_CATALOG.fromServer).toBe(false)
  })

  it('fills in BSP names and bundled images', () => {
    const intro = BUILTIN_CATALOG.maps.get('portal2:62761')!
    expect(intro).toMatchObject({
      title: 'Container Ride',
      bsp: 'sp_a1_intro1',
      chapter: 'The Courtesy Call',
      chapterNumber: 1,
    })
    expect(intro.image).toMatch(/62761\.jpg$/)
    expect(BUILTIN_CATALOG.maps.get('mel:5')).toMatchObject({
      bsp: 'st_a2_garden_de',
      mode: 'story',
      game: 'mel',
    })
    expect(builtInImage('47741')).toMatch(/47741\.jpg$/)
    expect(builtInImage('nope')).toBeNull()
  })

  it('is used for an empty or missing catalog', () => {
    expect(buildCatalog([])).toBe(BUILTIN_CATALOG)
    expect(buildCatalog(null)).toBe(BUILTIN_CATALOG)
  })
})

describe('buildCatalog', () => {
  it('keys games 1 and 2 by their historic names and others by slug', () => {
    expect(Object.keys(catalog.games)).toEqual(['portal2', 'mel', 'custom-game', 'portal-2-season-1'])
    expect(gameKey({ id: 1, slug: 'portal2' })).toBe('portal2')
    expect(gameKey({ id: 9, slug: 'x' })).toBe('x')
    expect(catalog.fromServer).toBe(true)
  })

  it('lists single player boards before co-op ones', () => {
    // The catalog has Portal 2's co-op chapters first.
    expect(catalog.games.portal2!.modes).toEqual(['sp', 'coop'])
    expect(catalog.games['portal-2-season-1']!.modes).toEqual([
      'portal-2-season-1-sp',
      'portal-2-season-1-coop',
    ])
    expect(catalog.multiplayerModes.has('coop')).toBe(true)
    expect(catalog.multiplayerModes.has('portal-2-season-1-coop')).toBe(true)
    expect(catalog.multiplayerModes.has('sp')).toBe(false)
  })

  it('names boards from the game, falling back to the default names', () => {
    expect(catalog.modeLabels['custom-game-sp']).toBe('Main Board')
    expect(catalog.modeLabels.sp).toBe('Singleplayer')
    expect(catalog.modeLabels['portal-2-season-1-coop']).toBe('Cooperative')
    expect(defaultModeLabel('speed_run')).toBe('Speed Run')
  })

  it('numbers chapters per board and keeps their database ids', () => {
    const sp = catalog.chaptersByMode.sp!
    expect(sp[0]).toMatchObject({
      name: 'The Courtesy Call',
      number: 1,
      dbId: 7,
      mode: 'sp',
      game: 'portal2',
    })
    expect(catalog.chaptersByMode.coop![0]).toMatchObject({
      name: 'Team Building',
      number: 1,
      dbId: 1,
      multiplayer: true,
    })
  })

  it('links a season copy to its base map and borrows its built-in image', () => {
    const copy = catalog.maps.get('portal-2-season-1:s4-47741')!
    expect(copy).toMatchObject({ sourceId: '47741', bsp: 'mp_coop_doors', mode: 'portal-2-season-1-coop' })
    expect(copy.image).toBe(builtInImage('47741'))
    expect(catalog.games['portal-2-season-1']).toMatchObject({
      kind: 'season',
      base: 'portal2',
      gameDir: 'portal2',
    })
    expect(catalog.games.mel!.gameDir).toBe('portal_stories')
  })

  it('uses an uploaded map image from the API', () => {
    expect(catalog.maps.get('custom-game:g3-1')!.image).toBe(
      'http://localhost:3000/api/v1/maps/g3-1/image?v=1792000557',
    )
  })

  it('points uploaded game branding at the API', () => {
    const branded = buildCatalog([{ ...(raw as CatalogRaw)[0]!, logo_version: 5, short_name: 'P2CM' }])
    expect(branded.games.portal2).toMatchObject({
      shortName: 'P2CM',
      logo: 'http://localhost:3000/api/v1/games/1/images/logo?v=5',
      background: null,
    })
  })
})
