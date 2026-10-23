import { describe, expect, it } from 'vitest'
import { buildCatalog, type CatalogRaw } from '@/lib/catalog'
import catalogRaw from '@/testing/fixtures/catalog.json'
import changelog from '@/testing/fixtures/changelog.json'
import coopBoard from '@/testing/fixtures/map-coop-board.json'
import coopHalves from '@/testing/fixtures/coop-halves.json'
import coopPreviews from '@/testing/fixtures/coop-previews.json'
import legacy from '@/testing/fixtures/legacy-adapted-runs.json'
import spBoard from '@/testing/fixtures/map-sp-board.json'
import spPreviews from '@/testing/fixtures/sp-previews.json'
import type {
  ChangelogRaw,
  CoopHalfRaw,
  CoopPreviewRaw,
  CoopRankedRaw,
  SpPreviewRaw,
  SpRankedRaw,
} from '@/types/runs'
import {
  adaptChangelog,
  adaptCoopHalf,
  adaptCoopRanked,
  adaptPreview,
  adaptSpRanked,
  UNKNOWN_PARTNER_AVATAR,
} from './runs'

// The fixtures are real API answers (src/testing/fixtures); legacy-adapted-runs.json is what the
// legacy adapters (frontend-legacy/src/api/client.js) made of them. The new adapters must agree,
// apart from the map object, which now comes from the catalog.
const catalog = buildCatalog(catalogRaw as CatalogRaw)
const rows = changelog as ChangelogRaw[]
const gameOf = (r: ChangelogRaw) => (r.map_id.length < 3 ? 'mel' : 'portal2')
const adapted = rows.map((r) => adaptChangelog(r, gameOf(r), catalog))
const byId = (id: number) => adapted.find((r) => r.id === id)!

describe('adaptChangelog', () => {
  it('matches the legacy adapter for every fixture row', () => {
    expect(adapted.map(({ map: _map, ...rest }) => rest)).toEqual(legacy.changelog)
  })

  it('takes the map from the catalog', () => {
    expect(byId(365437).map).toBe(catalog.maps.get(`mel:${rows.find((r) => r.id === 365437)!.map_id}`))
    expect(byId(365462).map.mode).toBe('coop')
  })

  it("falls back to the row's own map name when the catalog lacks the map", () => {
    const row = { ...rows[0]!, map_id: 'gone', map_name: 'Removed Map' }
    expect(adaptChangelog(row, 'portal2', catalog).map).toEqual({
      id: 'gone',
      title: 'Removed Map',
      chapter: '',
      mode: 'sp',
      game: 'portal2',
    })
  })

  it('gives points only to verified, unbanned runs', () => {
    expect(byId(365103).banned).toBe(true)
    expect(byId(365103).pointsDelta).toBeNull()
    expect(byId(365565).verified).toBe(false)
    expect(byId(365565).pointsDelta).toBeNull()
    expect(byId(365462).pointsDelta).toBe(14)
  })

  it('puts the blue player first and shows the filler partner as unknown', () => {
    expect(byId(365462).players.map((p) => p.name)).toEqual(['Snow', 'savvydruid'])
    expect(byId(365517).players[1]).toEqual({
      profileNumber: null,
      name: 'Unknown partner',
      avatar: UNKNOWN_PARTNER_AVATAR,
      unknown: true,
    })
    expect(byId(365541).rolesKnown).toBe(false)
    expect(byId(365561).rolesKnown).toBeNull()
  })

  it('fills in co-op profile numbers older servers left out', () => {
    const row = rows.find((r) => r.id === 365462)!
    const old = { ...row, blue_profile_number: null, orange_profile_number: null }
    const run = adaptChangelog(old, 'portal2', catalog)
    expect(run.players.find((p) => p.name === row.user_name)?.profileNumber).toBe(row.profile_number)
  })

  it('marks estimated dates', () => {
    expect(byId(172828).dateEstimated).toBe(true)
    expect(byId(365561).dateEstimated).toBe(false)
  })
})

describe('board and preview adapters', () => {
  it('match the legacy adapters', () => {
    expect((spBoard as SpRankedRaw[]).map(adaptSpRanked)).toEqual(legacy.spBoard)
    expect((coopBoard as CoopRankedRaw[]).map(adaptCoopRanked)).toEqual(legacy.coopBoard)
    expect((spPreviews as SpPreviewRaw[][]).flat().map(adaptPreview)).toEqual(legacy.spPreviews)
    expect((coopPreviews as CoopPreviewRaw[][]).flat().map(adaptPreview)).toEqual(legacy.coopPreviews)
    expect((coopHalves as CoopHalfRaw[]).map(adaptCoopHalf)).toEqual(legacy.coopHalves)
  })

  it('orders co-op board players by who hosted', () => {
    const [hostFirst, secondHosted, unknown, filler] = (coopBoard as CoopRankedRaw[]).map(adaptCoopRanked)
    expect(hostFirst!.players[0]!.name).toBe((coopBoard as CoopRankedRaw[])[0]!.map_data.user_name1)
    // p1_is_host false: the second player played blue.
    expect(secondHosted!.players[0]!.name).toBe((coopBoard as CoopRankedRaw[])[1]!.map_data.user_name2)
    expect(unknown!.rolesKnown).toBe(false)
    expect(filler!.players[1]!.unknown).toBe(true)
  })
})
