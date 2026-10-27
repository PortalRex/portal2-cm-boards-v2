import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG, chaptersFor } from '@/lib/catalog'
import type { MapScore } from '../types'
import { columnDirection, columnSort, orderedChapters } from './map-sort'

const chapters = chaptersFor(BUILTIN_CATALOG, 'sp').slice(0, 2)
const [a, b, c, d] = chapters.flatMap((ch) => ch.maps)

const score = (map: MapScore['map'], s: Partial<MapScore>): MapScore => ({
  map,
  rank: 10,
  score: 1000,
  timestamp: '2026-01-01T00:00:00',
  points: 150,
  deltaNext: 5,
  deltaWr: 50,
  youtubeId: null,
  changelogId: null,
  autorenderId: null,
  demoId: null,
  note: null,
  partner: null,
  ...s,
})

// a: fast, far from WR; b: slow, a WR (no ΔNext); c: no points; d: no score.
const scores = {
  [a!.id]: score(a!, { score: 900, deltaWr: 80, deltaNext: 2, points: 120 }),
  [b!.id]: score(b!, { score: 4000, rank: 1, deltaWr: 0, deltaNext: null, points: 200 }),
  [c!.id]: score(c!, { score: 2000, deltaWr: 30, deltaNext: 9, points: null }),
}
const maps = (sort: string) =>
  orderedChapters(chapters, scores, sort)[0]!
    .maps.slice(0, 4)
    .map((m) => m.title)
const [A, B, C, D] = [a!.title, b!.title, c!.title, d!.title]

describe('orderedChapters', () => {
  it('keeps the chapters in map order', () => {
    expect(orderedChapters(chapters, scores, 'default')).toBe(chapters)
  })

  it('sorts every map by a column, either way; scores without the value next, then maps without a score', () => {
    expect(maps('time')).toEqual([A, C, B, D])
    expect(maps('time-desc')).toEqual([B, C, A, D])
    expect(maps('next')).toEqual([A, C, B, D])
    expect(maps('next-desc')).toEqual([C, A, B, D])
    expect(maps('wr')).toEqual([B, C, A, D])
    expect(maps('points')).toEqual([B, A, C, D])
    expect(maps('points-asc')).toEqual([A, B, C, D])
  })

  it('names the one table after the order', () => {
    const [table] = orderedChapters(chapters, scores, 'points')
    expect(table).toMatchObject({ name: 'Most points first', sorted: true })
  })
})

describe('columnSort', () => {
  it("picks the column's first order, then flips it", () => {
    expect(columnSort('time', 'default')).toBe('time')
    expect(columnSort('time', 'time')).toBe('time-desc')
    expect(columnSort('time', 'time-desc')).toBe('time')
    // Points start with the most.
    expect(columnSort('points', 'time')).toBe('points')
    expect(columnSort('points', 'points')).toBe('points-asc')
  })

  it('tells which way a column is sorted', () => {
    expect(columnDirection('wr', 'wr')).toBe('asc')
    expect(columnDirection('points', 'points')).toBe('desc')
    expect(columnDirection('wr', 'points')).toBeNull()
    expect(columnDirection('wr', 'rank')).toBeNull()
  })
})
