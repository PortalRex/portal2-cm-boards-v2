import { player } from '@/lib/adapters/runs'
import { mapsForGame, mapsForMode, MEL, modeOf, p2ChapterByDbId, PORTAL2, type Catalog } from '@/lib/catalog'
import { countryById } from '@/lib/data/countries'
import type { AggregatedBoard, BoardRef, PointsWrapperRaw } from '../types'

/** The server's rows -> the Points board (most first) and the Time board (all maps done, fastest first). */
export function adaptPoints(wrapper: PointsWrapperRaw | null | undefined, mapCount: number): AggregatedBoard {
  const rows = (wrapper?.points ?? []).map(([profileNumber, p]) => ({
    player: {
      ...player(profileNumber, p.user_name, p.avatar),
      country: countryById(p.country_id)?.code ?? null,
    },
    points: p.points,
    score: p.score,
    numScores: p.num_scores,
  }))
  const points = [...rows].sort((a, b) => b.points - a.points)
  const times = rows.filter((r) => r.numScores >= mapCount).sort((a, b) => a.score - b.score)
  return { points, times, mapCount }
}

// The built-in games' boards keep legacy's fixed map counts.
const BUILT_IN_MAP_COUNTS: Record<string, number> = {
  [`${PORTAL2}:overall`]: 108,
  [`${PORTAL2}:sp`]: 60,
  [`${PORTAL2}:coop`]: 48,
  [`${MEL}:overall`]: 40,
  [`${MEL}:story`]: 22,
  [`${MEL}:advanced`]: 18,
}

export interface ServerBoard {
  /** games.id for /points/game/{game_id}/{board}. */
  gameId: number
  /** The server's board key: "overall", "chapter-<id>" or the chapters' game_mode. */
  board: string
  /** How many maps a player needs a time on to show on the Time board. */
  mapCount: number
}

/** Where a board's points come from on the server, or null for a game the catalog doesn't know. */
export function serverBoard(c: Catalog, { game, board }: BoardRef): ServerBoard | null {
  const gameId = c.games[game]?.dbId
  if (gameId == null) return null
  const builtIn = BUILT_IN_MAP_COUNTS[`${game}:${board}`]
  if (builtIn != null) return { gameId, board, mapCount: builtIn }
  const chapterId = /^chapter-(\d+)$/.exec(board)?.[1]
  if (chapterId) return { gameId, board, mapCount: p2ChapterByDbId(c, chapterId)?.maps.length ?? 0 }
  const maps = board === 'overall' ? mapsForGame(c, game) : mapsForMode(c, board)
  // The server keys boards by the chapters' game_mode; the site's keys carry the game's slug.
  return { gameId, board: modeOf(game, board), mapCount: maps.length }
}
