import { describe, expect, it } from 'vitest'
import { buildCatalog, type CatalogRaw } from '@/lib/catalog'
import catalogRaw from '@/testing/fixtures/catalog.json'
import { seasonFilters } from './season-filters'

const catalog = buildCatalog(catalogRaw as CatalogRaw)
const SEASON = 'portal-2-season-1'

describe('seasonFilters', () => {
  it("asks for the season's copies of the picked board and chamber", () => {
    expect(seasonFilters(catalog, 'portal2', SEASON, { mode: 'sp', mapId: '47458' })).toEqual({
      mode: `${SEASON}-sp`,
      mapId: 's4-47458',
    })
    expect(seasonFilters(catalog, 'portal2', SEASON, { mode: '', mapId: '' })).toEqual({
      mode: '',
      mapId: '',
    })
  })

  it('leaves them as they are all-time, and keeps a chamber the season has no copy of', () => {
    const f = { mode: 'coop', mapId: '47741', q: 'x' }
    expect(seasonFilters(catalog, 'portal2', null, f)).toBe(f)
    expect(seasonFilters(catalog, 'portal2', SEASON, { mode: 'sp', mapId: 'nope' }).mapId).toBe('nope')
  })
})
