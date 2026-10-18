import type { ReactNode } from 'react'
import type { MapInfo } from '@/lib/catalog'
import type { Player, Run, RunMap } from '@/types/runs'

// --- raw API types (snake_case, as the Rust models send them) ------------------------------

/** One of GET /profile/{id}'s points entries: -1 single player, -2 co-op, -3 overall, else a chapter. */
export interface ProfilePointsRaw {
  id: number
  points: { points: number } | null
  place: number | null
  score_place?: number | null
  country_place?: number | null
}

export interface ProfileDateRaw {
  map: string
  map_name: string
  score: number
  timestamp: string
}

/** GET /profile/{steam id}: points, oldest / newest runs and the rank on every Portal 2 map. */
export interface ProfilePageRaw {
  points: ProfilePointsRaw[] | null
  data: {
    oldest_sp?: ProfileDateRaw | null
    newest_sp?: ProfileDateRaw | null
    oldest_coop?: ProfileDateRaw | null
    newest_coop?: ProfileDateRaw | null
  } | null
  ranks: Record<string, number> | null
}

/** GET /user/{steam id}. */
export interface UserRaw {
  profile_number: string
  board_name: string | null
  steam_name: string | null
  banned: boolean
  avatar: string | null
  twitch: string | null
  youtube: string | null
  title: string | null
  admin: number
  country_id: number | null
  frozen?: boolean
  frozen_reason?: string | null
  role?: string | null
  name_locked?: boolean
  avatar_locked?: boolean
  avatar_custom?: boolean
  legends_at?: string | null
}

/** GET /profile/at/{steam id}?at=YYYY-MM-DD: where the player stood at the end of that day. */
export interface ProfileAtRaw {
  at: string
  points: { sp?: number; coop?: number; overall?: number } | null
  places: { sp?: number | null; coop?: number | null; overall?: number | null } | null
  country_place: number | null
  maps: {
    map_id: string
    score: number
    rank: number
    points: number
    changelog_id: number
    timestamp: string | null
  }[]
}

export type PointsBoardKey = 'sp' | 'coop' | 'overall'

/** GET /profile/points_peak/{steam id}: each board's highest points and the day they were reached. */
export type PointsPeak = Partial<Record<PointsBoardKey, { points: number; date: string }>>

// --- the site's profile ------------------------------------------------------------------

/** The player's best on one map. */
export interface MapScore {
  map: MapInfo
  rank: number | null
  score: number | null
  timestamp: string | null
  points: number | null
  deltaNext: number | null
  deltaWr: number | null
  changelogId: number | null
  youtubeId: string | null
  autorenderId: string | null
  demoId: number | null
  note: string | null
  portals?: number | null
  sarVersion?: string | null
  dateEstimated?: boolean
  partner: Player | null
}

export interface ProfileBadge {
  label: string
  tone: 'teal' | 'red' | 'staff'
}

export interface ProfilePlayer {
  profileNumber: string
  name: string
  avatar: string | null
  country: string | null
  badges: ProfileBadge[]
  titles: string[]
  role: string | null
  twitch: string | null
  youtube: string | null
  banned: boolean
  steamName: string | null
  nameLocked: boolean
  avatarLocked: boolean
  avatarCustom: boolean
  /** When their peak points reached Legends (a role kept for good), if they have. */
  legendsAt: string | null
  frozen: boolean
  frozenReason: string | null
  steam: string
}

/** A run shown by its map, time and date (newest / oldest score). */
export interface ScoreBrief {
  map: Pick<RunMap, 'title'> & Partial<RunMap>
  score: number
  timestamp: string | null
}

export interface BoardNumbers<T> {
  sp: T
  coop: T
  overall: T
}

export interface Profile {
  player: ProfilePlayer
  points: BoardNumbers<number>
  globalRank: BoardNumbers<number | null> & { country: number | null }
  averagePlace: BoardNumbers<number | null>
  worldRecords: { sp: number; coop: number }
  newest: ScoreBrief | null
  oldest: ScoreBrief | null
  best: MapScore | null
  worst: MapScore | null
  /** By map id. */
  scores: Record<string, MapScore>
  history: Run[]
  /** Set when showing the profile as it was on a past day (YYYY-MM-DD). */
  asOf?: string
}

/** A player's results in a game other than Portal 2 (Mel, a custom game, a season). */
export interface GameResults {
  scores: Record<string, MapScore>
  history: Run[]
}

/** The run details under an opened row, filled in by the route (features/runs). */
export type RenderRunDetails = (
  run: MapScore & { players?: Player[] },
  map: MapInfo,
  game: string,
  rendered: Map<number, string>,
) => ReactNode

/** GET /profile/stats/{steam id} (with game_id): runs, maps, demo figures, partners. */
export interface ProfileStatsRaw {
  summary: {
    runs: number
    verified_runs: number
    runs_with_demo: number
    runs_with_video: number
    first_run: string | null
    latest_run: string | null
    sp_maps: number
    coop_maps: number
    sp_map_count: number
    coop_map_count: number
    time_saved: number
    runs_with_portals: number
    portals_total: number
    pbs_with_portals: number
    pb_portals_total: number
    wr_runs: number
    wr_maps: number
  } | null
  unique_partners: number
  partners: {
    profile_number: string
    user_name: string | null
    avatar: string | null
    maps: number
    runs: number
  }[]
  fewest_portals: { map_id: string; map_name: string; score: number; portals: number }[]
}

export interface ProfileStats {
  summary: ProfileStatsRaw['summary']
  uniquePartners: number
  partners: { player: Player; maps: number; runs: number }[]
  fewestPortals: { map: RunMap | null; mapName: string; score: number; portals: number }[]
}
