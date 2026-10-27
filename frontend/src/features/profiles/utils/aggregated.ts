import { chapterDbId, chaptersFor, modeLabel, PORTAL2, type Catalog } from '@/lib/catalog'
import type { AggregateRowRaw } from '../types'
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
export const formatPointsGap = (gap: number | null | undefined): string =>
  gap == null ? '–' : Math.round(gap) === 0 ? '0' : `${Math.round(gap) > 0 ? '+' : ''}${Math.round(gap)}`
