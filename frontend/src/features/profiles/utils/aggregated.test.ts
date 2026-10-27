import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG, chapterDbId, chaptersFor, MEL, PORTAL2 } from '@/lib/catalog'
import {
  aggregatedLines,
  formatPointsGap,
  nextAggregatedSort,
  sortAggregated,
  type AggregatedSort,
} from './aggregated'

const pn = '76561198000000001'

describe('aggregatedLines', () => {
  const first = chaptersFor(BUILTIN_CATALOG, 'sp')[0]!
  const rows = [
    {
      board: `chapter-${chapterDbId(first)}`,
      points: { rank: 14, value: 1443.2, next: -26, wr: -310 },
      time: null,
    },
    {
      board: 'overall',
      points: { rank: 6, value: 18902, next: -402, wr: -1947 },
      time: { rank: 7, value: 325706, next: 1563, wr: 10869 },
    },
  ]
  const groups = aggregatedLines(BUILTIN_CATALOG, PORTAL2, rows, pn)

  it('groups single player chapters, co-op courses, then the totals', () => {
    expect(groups.map((g) => g.length)).toEqual([
      chaptersFor(BUILTIN_CATALOG, 'sp').length,
      chaptersFor(BUILTIN_CATALOG, 'coop').length,
      3,
    ])
    expect(groups[0]![0]!.label).toBe(first.name)
    expect(groups[2]!.map((l) => l.label)).toEqual(['Single Player', 'Cooperative', 'Overall'])
  })

  it("gives each line its board's standing (or none) and address on the player", () => {
    expect(groups[0]![0]!.row?.points?.rank).toBe(14)
    expect(groups[0]![0]!.href).toBe(`/leaderboard/chapter/${chapterDbId(first)}?player=${pn}`)
    expect(groups[0]![1]!.row).toBeNull()
    expect(groups[2]![2]!.row?.time?.value).toBe(325706)
    expect(groups[2]![0]!.href).toBe(`/leaderboard/sp?player=${pn}`)
  })
})

describe('aggregatedLines for Mel', () => {
  const story = chaptersFor(BUILTIN_CATALOG, 'story')
  const rows = [
    {
      board: `chapter-${chapterDbId(story[0]!)}`,
      points: { rank: 3, value: 500, next: -10, wr: -90 },
      time: null,
    },
    { board: 'story', points: { rank: 2, value: 4000, next: -20, wr: -100 }, time: null },
    { board: 'overall', points: { rank: 4, value: 7000, next: -30, wr: -300 }, time: null },
  ]
  const groups = aggregatedLines(BUILTIN_CATALOG, MEL, rows, pn)

  it("lists Mel's Story and Advanced chapters and boards, not Portal 2's", () => {
    expect(groups.map((g) => g.length)).toEqual([
      story.length,
      chaptersFor(BUILTIN_CATALOG, 'advanced').length,
      3,
    ])
    expect(groups[0]![0]!.label).toBe(story[0]!.name)
    expect(groups[2]!.map((l) => l.key)).toEqual(['story', 'advanced', 'overall'])
    expect(groups.flat().some((l) => l.label === 'Single Player' || l.label === 'Cooperative')).toBe(false)
  })

  it("links Mel's boards, and leaves its chapters (which have no board page) unlinked", () => {
    expect(groups[0]![0]!.row?.points?.rank).toBe(3)
    expect(groups[0]![0]!.href).toBeNull()
    expect(groups[2]![0]!.row?.points?.value).toBe(4000)
    expect(groups[2]![0]!.href).toBe(`/leaderboard/mel/story?player=${pn}`)
    expect(groups[2]![2]!.href).toBe(`/leaderboard/mel/overall?player=${pn}`)
  })
})

describe('formatPointsGap', () => {
  it('shows whole, signed points, and a dash when there is no one ahead', () => {
    expect(formatPointsGap(-26.4)).toBe('-26')
    expect(formatPointsGap(-0.2)).toBe('0')
    expect(formatPointsGap(null)).toBe('–')
  })
})

describe('sortAggregated', () => {
  const [one, two, three] = chaptersFor(BUILTIN_CATALOG, 'sp')
  const standing = (rank: number, value: number, next: number | null, wr: number) => ({
    rank,
    value,
    next,
    wr,
  })
  // two: first place (no gap to the next); three: no standing.
  const rows = [
    { board: `chapter-${chapterDbId(one!)}`, points: standing(14, 1443, -26, -310), time: null },
    { board: `chapter-${chapterDbId(two!)}`, points: standing(1, 2000, null, 0), time: null },
    { board: 'overall', points: standing(6, 18902, -402, -1947), time: null },
  ]
  const groups = aggregatedLines(BUILTIN_CATALOG, PORTAL2, rows, pn)
  const points = (line: (typeof groups)[0][0]) => line.row?.points ?? null
  const firstThree = (sort: AggregatedSort | null, morePointsFirst = true) =>
    sortAggregated(groups, points, sort, morePointsFirst)[0]!
      .slice(0, 3)
      .map((l) => l.label)

  it('orders each group of chapters best first, or reversed; lines without the number last', () => {
    expect(firstThree(null)).toEqual([one!.name, two!.name, three!.name])
    expect(firstThree({ column: 'rank', reversed: false })).toEqual([two!.name, one!.name, three!.name])
    expect(firstThree({ column: 'rank', reversed: true })).toEqual([one!.name, two!.name, three!.name])
    // The most points first; for a time, the least.
    expect(firstThree({ column: 'value', reversed: false })).toEqual([two!.name, one!.name, three!.name])
    expect(firstThree({ column: 'value', reversed: false }, false)).toEqual([
      one!.name,
      two!.name,
      three!.name,
    ])
    // Smallest gap first, whatever its sign; first place has no gap to the next.
    expect(firstThree({ column: 'wr', reversed: false })).toEqual([two!.name, one!.name, three!.name])
    expect(firstThree({ column: 'next', reversed: true })).toEqual([one!.name, two!.name, three!.name])
  })

  it('leaves the totals in their order', () => {
    const sorted = sortAggregated(groups, points, { column: 'value', reversed: true }, true)
    expect(sorted[2]!.map((l) => l.key)).toEqual(['sp', 'coop', 'overall'])
  })

  it('goes best first, reversed, then back to the chapter order', () => {
    const best = nextAggregatedSort('wr', null)
    expect(best).toEqual({ column: 'wr', reversed: false })
    const reversed = nextAggregatedSort('wr', best)
    expect(reversed).toEqual({ column: 'wr', reversed: true })
    expect(nextAggregatedSort('wr', reversed)).toBeNull()
    expect(nextAggregatedSort('rank', reversed)).toEqual({ column: 'rank', reversed: false })
  })
})
