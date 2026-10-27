import type { Chapter, MapInfo } from '@/lib/catalog'
import { parseTimestamp } from '@/lib/format'
import type { MapScore } from '../types'

/** The score table columns a header click sorts by. */
export type SortColumn = 'time' | 'next' | 'wr' | 'points'

interface MapSort {
  value: string
  label: string
  /** The number maps are ordered by; null when the score has none (it goes after those that do). */
  key?: (s: MapScore) => number | null | undefined
  desc?: boolean
  column?: SortColumn
}

const time = (s: MapScore) => s.score
const next = (s: MapScore) => s.deltaNext
const wr = (s: MapScore) => s.deltaWr
const points = (s: MapScore) => s.points
const date = (s: MapScore) => (s.timestamp ? parseTimestamp(s.timestamp)?.getTime() : null)

export const MAP_SORTS: MapSort[] = [
  { value: 'default', label: 'Map order' },
  { value: 'rank', label: 'Best rank first', key: (s) => s.rank },
  { value: 'worst', label: 'Worst rank first', key: (s) => s.rank, desc: true },
  { value: 'date', label: 'Newest first', key: date, desc: true },
  // A column's first entry is what a click on its header picks; the next click flips it.
  { value: 'time', label: 'Fastest time first', key: time, column: 'time' },
  { value: 'time-desc', label: 'Slowest time first', key: time, desc: true, column: 'time' },
  { value: 'next', label: 'Smallest ΔNext first', key: next, column: 'next' },
  { value: 'next-desc', label: 'Largest ΔNext first', key: next, desc: true, column: 'next' },
  { value: 'wr', label: 'Smallest ΔWR first', key: wr, column: 'wr' },
  { value: 'wr-desc', label: 'Largest ΔWR first', key: wr, desc: true, column: 'wr' },
  { value: 'points', label: 'Most points first', key: points, desc: true, column: 'points' },
  { value: 'points-asc', label: 'Fewest points first', key: points, column: 'points' },
]

/** The sort a click on a column's header picks: the column's first order, or the other one if it's on. */
export function columnSort(column: SortColumn, current: string): string {
  const [first, second] = MAP_SORTS.filter((o) => o.column === column)
  return current === first!.value ? second!.value : first!.value
}

/** Which way the table is sorted by a column, if it is. */
export function columnDirection(column: SortColumn, current: string): 'asc' | 'desc' | null {
  const sort = MAP_SORTS.find((o) => o.value === current)
  if (sort?.column !== column) return null
  return sort.desc ? 'desc' : 'asc'
}

/**
 * The chapter tables to show. "default" keeps the game's chapters; the other orders list every
 * map of the mode in one table: maps with the value first, then scores without it, then maps
 * without a score, each group in map order.
 */
export function orderedChapters(
  chapters: Chapter[],
  scores: Record<string, MapScore>,
  sort: string,
): (Chapter & { sorted?: boolean })[] {
  const order = MAP_SORTS.find((o) => o.value === sort)
  if (!order?.key || !chapters[0]) return chapters
  const { key, desc } = order
  const groupOf = (m: MapInfo): [number, number] => {
    const s = scores[m.id]
    if (!s) return [2, 0]
    const value = key(s)
    if (value == null) return [1, 0]
    return [0, desc ? -value : value]
  }
  const maps = chapters
    .flatMap((c) => c.maps)
    .map((m) => ({ m, at: groupOf(m) }))
    .sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1])
    .map(({ m }) => m)
  return [{ ...chapters[0], name: order.label, maps, sorted: true }]
}
