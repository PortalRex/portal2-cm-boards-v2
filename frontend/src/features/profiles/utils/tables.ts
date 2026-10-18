import { cn } from 'cn'
import { chapterDbId, type Chapter } from '@/lib/catalog'
import { parseTimestamp } from '@/lib/format'
import type { ProfilePlayer } from '../types'

/** A rank cell's colouring: the world record glow (`raised`: a free-standing square) or the rank tile. */
export const rankClass = (rank: number | null | undefined, raised = false) =>
  rank === 1 ? cn('wr-glow', raised && 'wr-glow-raised') : rank ? 'rank-tile' : undefined

/** A Portal 2 chapter's aggregated board, opened on the player's row. */
export const chapterBoardPath = (chapter: Chapter, player: ProfilePlayer) =>
  `/leaderboard/chapter/${chapterDbId(chapter)}?player=${player.profileNumber}`

const WEEK_MS = 7 * 24 * 3600 * 1000

/** Whether a run is from the past week (the newest score shows green until then). */
export const isRecent = (timestamp: string | null | undefined, now = Date.now()) =>
  Boolean(timestamp) && now - (parseTimestamp(timestamp)?.getTime() ?? 0) < WEEK_MS
