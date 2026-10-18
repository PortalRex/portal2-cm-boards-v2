import { describe, expect, it } from 'vitest'
import { buildCatalog, type CatalogRaw } from '@/lib/catalog'
import catalogRaw from '@/testing/fixtures/catalog.json'
import wrRaw from '@/testing/fixtures/stats-wr.json'
import { adaptWrStats, type WrStatsRaw } from '../api/stats'
import { boardLabel, days, hue, number, pick } from './format'

const catalog = buildCatalog(catalogRaw as CatalogRaw)

describe('stats formatting', () => {
  it('formats counts and days', () => {
    expect(number(10443)).toBe('10,443')
    expect(days(1)).toBe('1 day')
    expect(days(1154.6)).toBe('1,155 days')
  })

  it('names boards and keeps only known ones from the address', () => {
    expect(boardLabel(catalog, 'overall')).toBe('Overall')
    expect(boardLabel(catalog, 'coop')).toBe('Cooperative')
    expect(pick('coop', ['sp', 'coop'], 'sp')).toBe('coop')
    expect(pick('story', ['sp', 'coop'], 'sp')).toBe('sp')
    expect(pick(undefined, ['sp'], 'overall')).toBe('overall')
  })

  it('gives each player a steady colour', () => {
    expect(hue('76561198823602829')).toBe(hue('76561198823602829'))
    expect(hue('76561198823602829')).toBeGreaterThanOrEqual(0)
    expect(hue('76561198823602829')).toBeLessThan(360)
  })
})

describe('adaptWrStats', () => {
  it('reads records, teams and the race frames', () => {
    const s = adaptWrStats(catalog, 'portal2', wrRaw as WrStatsRaw)
    expect(s.records[3]).toMatchObject({ mapName: 'Doors', mode: 'coop', isCoop: true, map: { id: '47741' } })
    expect(s.records[3]!.teams[0]!.players.map((p) => p.name)).toEqual(['RealCreative', 'Suola'])
    expect(s.longest[1]!.beatenBy).toEqual([])
    expect(s.race.overall!.frames[0]!.top[0]).toEqual({ profileNumber: '76561198823602829', held: 25 })
    expect(s.racePlayers['76561198823602829']?.name).toBe('RealCreative')
  })
})
