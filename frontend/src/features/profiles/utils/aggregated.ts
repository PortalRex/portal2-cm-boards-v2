import { chapterDbId, chaptersFor, type Catalog } from '@/lib/catalog'
import type { AggregateRowRaw } from '../types'

/** One line of the aggregated tables: a chapter, a course or a total, with its board's address. */
export interface AggregatedLine {
  key: string
  label: string
  href: string
  row: AggregateRowRaw | null
}

const TOTALS: { key: string; label: string }[] = [
  { key: 'sp', label: 'Single Player' },
  { key: 'coop', label: 'Cooperative' },
  { key: 'overall', label: 'Overall' },
]

/**
 * The lines of a player's aggregated tables, as the old boards grouped them: single player
 * chapters, co-op courses, then the totals. Each line has the server's standing for its board (or
 * none) and leads to that board, opened on the player.
 */
export function aggregatedLines(
  c: Catalog,
  rows: AggregateRowRaw[],
  profileNumber: string,
): AggregatedLine[][] {
  const byBoard = new Map(rows.map((r) => [r.board, r]))
  const chapters = (mode: string) =>
    chaptersFor(c, mode).map((chapter) => {
      const key = `chapter-${chapterDbId(chapter)}`
      return {
        key,
        label: chapter.name,
        href: `/leaderboard/chapter/${chapterDbId(chapter)}?player=${profileNumber}`,
        row: byBoard.get(key) ?? null,
      }
    })
  const totals = TOTALS.map(({ key, label }) => ({
    key,
    label,
    href: `/leaderboard/${key}?player=${profileNumber}`,
    row: byBoard.get(key) ?? null,
  }))
  return [chapters('sp'), chapters('coop'), totals].filter((group) => group.length > 0)
}

/** A points gap as the old boards showed it: whole points, signed ("-26"). */
export const formatPointsGap = (gap: number | null | undefined): string =>
  gap == null ? '–' : Math.round(gap) === 0 ? '0' : `${Math.round(gap) > 0 ? '+' : ''}${Math.round(gap)}`
