import { cn } from 'cn'
import { chapterDbId, type Chapter } from '@/lib/catalog'
import type { ProfilePlayer } from '../types'

/** A rank cell's colouring: the world record glow (`raised`: a free-standing square) or the rank tile. */
export const rankClass = (rank: number | null | undefined, raised = false) =>
  rank === 1 ? cn('wr-glow', raised && 'wr-glow-raised') : rank ? 'rank-tile' : undefined

/** A chapter's aggregated board, opened on the player's row (see chapterHasBoard). */
export const chapterBoardPath = (chapter: Chapter, player: ProfilePlayer) =>
  `/leaderboard/chapter/${chapterDbId(chapter)}?player=${player.profileNumber}`
