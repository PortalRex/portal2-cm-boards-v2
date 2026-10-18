import type { Player } from '@/types/runs'

/** A player's entry on GET /points/game/{game_id}/{board} (the server's `Points`). */
export interface PointsRaw {
  points: number
  /** Sum of the player's times on the board's maps, in centiseconds. */
  score: number
  num_scores: number
  total_rank_sum: number
  worst: [number, string]
  best: [number, string]
  user_name: string | null
  avatar: string | null
  country_id: number | null
}

/** GET /points/game/{game_id}/{board}: `[profile_number, Points]` pairs. */
export interface PointsWrapperRaw {
  id: number | null
  points: [string, PointsRaw][]
}

export interface AggregatedRow {
  player: Player & { country: string | null }
  points: number
  score: number
  numScores: number
}

export interface AggregatedBoard {
  /** Everyone, most points first. */
  points: AggregatedRow[]
  /** Players with a time on every map, fastest total first. */
  times: AggregatedRow[]
  mapCount: number
}

/** One aggregated board of a game: "overall", a board key ("sp", "<slug>-<mode>") or "chapter-<id>". */
export interface BoardRef {
  game: string
  board: string
}
