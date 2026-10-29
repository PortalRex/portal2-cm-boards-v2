import { chapterDbId, chaptersFor, modeLabel, PORTAL2, type Catalog } from '@/lib/catalog'
import type { AggregateRowRaw, StandingRaw } from '../types'
import { boardPath, serverMode } from './summary'

/**
 * One line of the aggregated tables: a chapter, a mode or the overall total, with its board's
 * address (none for another game's chapters, which have no board page of their own).
 */
export interface AggregatedLine {
  key: string
  label: string
  href: string | null
  row: AggregateRowRaw | null
}

const P2_TOTAL_LABELS: Record<string, string> = { sp: 'Single Player', coop: 'Cooperative' }

/**
 * The lines of a player's aggregated tables for a game, as the old boards grouped them: each of
 * its boards' chapters (Portal 2's single player chapters, then co-op courses), then a total per
 * board and the overall total. Each line has the server's standing for its board (or none) and
 * leads to that board, opened on the player.
 */
export function aggregatedLines(
  c: Catalog,
  game: string,
  rows: AggregateRowRaw[],
  profileNumber: string,
): AggregatedLine[][] {
  const byBoard = new Map(rows.map((r) => [r.board, r]))
  const modes = game === PORTAL2 ? ['sp', 'coop'] : (c.games[game]?.modes ?? [])
  const chapters = (mode: string) =>
    chaptersFor(c, mode).map((chapter) => {
      const key = `chapter-${chapterDbId(chapter)}`
      return {
        key,
        label: chapter.name,
        href:
          game === PORTAL2 ? `/leaderboard/chapter/${chapterDbId(chapter)}?player=${profileNumber}` : null,
        row: byBoard.get(key) ?? null,
      }
    })
  const totals = [
    ...modes.map((mode) => ({
      key: serverMode(game, mode),
      label: (game === PORTAL2 && P2_TOTAL_LABELS[mode]) || modeLabel(c, mode),
      href: `${boardPath(game, mode)}?player=${profileNumber}`,
      row: byBoard.get(serverMode(game, mode)) ?? null,
    })),
    {
      key: 'overall',
      label: 'Overall',
      href: `${boardPath(game, 'overall')}?player=${profileNumber}`,
      row: byBoard.get('overall') ?? null,
    },
  ]
  return [...modes.map(chapters), totals].filter((group) => group.length > 0)
}

/** A points gap as the old boards showed it: whole points, signed ("-26"). */
/** How far back the points tables' arrows look. */
export const RECENT_DAYS = 30

/** The day RECENT_DAYS before the profile's day (`at`, YYYY-MM-DD; today when null). */
export function recentFrom(at: string | null, now = Date.now()): string {
  const day = at ? Date.parse(`${at}T00:00:00Z`) : now
  return new Date(day - RECENT_DAYS * 24 * 3600 * 1000).toISOString().slice(0, 10)
}

/**
 * Each board's points change since `before` (the boards as they stood then; none when the player
 * had no runs yet), to a tenth of a point; boards that didn't change are left out.
 */
export function pointsChanges(now: AggregateRowRaw[], before: AggregateRowRaw[]): Map<string, number> {
  const then = new Map(before.map((r) => [r.board, r.points?.value ?? 0]))
  const changes = new Map<string, number>()
  for (const r of now) {
    const change = Math.round(((r.points?.value ?? 0) - (then.get(r.board) ?? 0)) * 10) / 10
    if (change !== 0) changes.set(r.board, change)
  }
  return changes
}

export const formatPointsGap = (gap: number | null | undefined): string =>
  gap == null ? '–' : Math.round(gap) === 0 ? '0' : `${Math.round(gap) > 0 ? '+' : ''}${Math.round(gap)}`

/** The aggregated tables' sortable columns: place, points or time, and the two gaps. */
export type AggregatedColumn = 'rank' | 'value' | 'next' | 'wr'

/** A table's order: by a column, best first unless reversed. */
export interface AggregatedSort {
  column: AggregatedColumn
  reversed: boolean
}

/** A header click: best first, then reversed, then back to the chapters' own order. */
export function nextAggregatedSort(
  column: AggregatedColumn,
  current: AggregatedSort | null,
): AggregatedSort | null {
  if (current?.column !== column) return { column, reversed: false }
  return current.reversed ? null : { column, reversed: true }
}

/**
 * Whether a column's numbers go down in the table's order. Best first is the lowest place, the
 * most points, the fastest time and the smallest gaps.
 */
export function sortsDescending(sort: AggregatedSort, morePointsFirst: boolean): boolean {
  const bestIsHighest = sort.column === 'value' && morePointsFirst
  return bestIsHighest !== sort.reversed
}

/**
 * The tables' lines in a column's order, within each group of chapters (the totals keep theirs).
 * Lines without a standing or without that number (no gap for first place) go last, in their
 * own order. `pick` is the table's standing: points or time.
 */
export function sortAggregated(
  groups: AggregatedLine[][],
  pick: (line: AggregatedLine) => StandingRaw | null,
  sort: AggregatedSort | null,
  morePointsFirst: boolean,
): AggregatedLine[][] {
  if (!sort) return groups
  const number = (s: StandingRaw) => {
    if (sort.column === 'rank') return s.rank
    if (sort.column === 'value') return s.value
    const gap = sort.column === 'next' ? s.next : s.wr
    return gap == null ? null : Math.abs(gap)
  }
  const sign = sortsDescending(sort, morePointsFirst) ? -1 : 1
  const place = (line: AggregatedLine): [number, number] => {
    const s = pick(line)
    const n = s ? number(s) : null
    return n == null ? [1, 0] : [0, sign * n]
  }
  return groups.map((lines) => {
    if (!lines.every((l) => l.key.startsWith('chapter-'))) return lines
    return lines
      .map((line) => ({ line, at: place(line) }))
      .sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1])
      .map(({ line }) => line)
  })
}
