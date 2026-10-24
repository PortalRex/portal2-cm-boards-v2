import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG, chapterDbId, chaptersFor } from '@/lib/catalog'
import { aggregatedLines, formatPointsGap } from './aggregated'

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
  const groups = aggregatedLines(BUILTIN_CATALOG, rows, pn)

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

describe('formatPointsGap', () => {
  it('shows whole, signed points, and a dash when there is no one ahead', () => {
    expect(formatPointsGap(-26.4)).toBe('-26')
    expect(formatPointsGap(-0.2)).toBe('0')
    expect(formatPointsGap(null)).toBe('–')
  })
})
