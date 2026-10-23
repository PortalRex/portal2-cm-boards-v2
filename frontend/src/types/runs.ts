import type { MapInfo } from '@/lib/catalog'

// The run rows the site shows everywhere (Score Updates, map boards, profiles, stats). Raw types
// match the server's JSON exactly (server/src/models); the adapters in lib/adapters turn them into
// the UI types below.

/** A changelog entry (server/src/models/changelog.rs ChangelogPage). */
export interface ChangelogRaw {
  id: number
  /** UTC without a zone; null for some old-board runs. */
  timestamp: string | null
  profile_number: string
  score: number
  map_id: string
  demo_id: number | null
  banned: boolean
  youtube_id: string | null
  previous_id: number | null
  coop_id: number | null
  post_rank: number | null
  pre_rank: number | null
  submission: number
  note: string | null
  category_id: number
  score_delta: number | null
  verified: boolean | null
  admin_note: string | null
  autorender_id: string | null
  map_name: string
  user_name: string
  avatar: string
  blue_name: string | null
  orange_name: string | null
  blue_avatar: string | null
  orange_avatar: string | null
  blue_profile_number: string | null
  orange_profile_number: string | null
  coop_roles_known: boolean | null
  wr_hidden: boolean
  portals: number | null
  sar_version: string | null
  date_estimated: boolean
  reactions_up: number
  reactions_down: number
}

/** A single player board row's run (models/sp.rs SpMap). */
export interface SpMapRaw {
  cl_id: number
  timestamp: string | null
  profile_number: string
  score: number
  demo_id: number | null
  youtube_id: string | null
  submission: number
  note: string | null
  category_id: number
  user_name: string | null
  avatar: string | null
  autorender_id: string | null
  portals: number | null
  sar_version: string | null
}

export interface SpRankedRaw {
  map_data: SpMapRaw
  rank: number
  points: number
}

/** A co-op board row's run (models/coop.rs CoopMap). */
export interface CoopMapRaw {
  coop_id: number
  cl_id1: number
  cl_id2: number
  timestamp: string | null
  profile_number1: string
  profile_number2: string
  score: number
  /** False when the second player hosted (played blue); null when unknown. */
  p1_is_host: boolean | null
  demo_id1: number | null
  demo_id2: number | null
  youtube_id1: string | null
  youtube_id2: string | null
  submission1: number
  submission2: number
  note1: string | null
  note2: string | null
  category_id: number
  user_name1: string
  user_name2: string | null
  avatar1: string | null
  avatar2: string | null
  autorender_id1: string | null
  autorender_id2: string | null
  portals1: number | null
  portals2: number | null
  sar_version1: string | null
  sar_version2: string | null
}

export interface CoopRankedRaw {
  map_data: CoopMapRaw
  rank: number
  points: number
}

/** GET /sp: the top runs per map (models/sp.rs SpPreview). */
export interface SpPreviewRaw {
  profile_number: string
  score: number
  youtube_id: string | null
  category_id: number
  user_name: string
  map_id: string
  autorender_id: string | null
}

/** GET /coop (models/coop.rs CoopPreview). */
export interface CoopPreviewRaw {
  profile_number1: string
  profile_number2: string | null
  score: number
  youtube_id1: string | null
  youtube_id2: string | null
  category_id: number
  user_name1: string
  user_name2: string | null
  map_id: string
  autorender_id: string | null
}

/** GET /coop/{id}/halves: each player's half of a co-op run. */
export interface CoopHalfRaw {
  profile_number: string | null
  user_name: string | null
  avatar: string | null
  is_host: boolean | null
  changelog_id: number | null
  score: number | null
  timestamp: string | null
  note: string | null
  youtube_id: string | null
  autorender_id: string | null
  demo_id: number | null
  has_segments: boolean
  portals: number | null
  sar_version: string | null
}

// --- UI types ----------------------------------------------------------------------------

export interface Player {
  /** Steam id (a string: it doesn't fit a JS number); null for an unknown co-op partner. */
  profileNumber: string | null
  name: string
  avatar: string | null
  /** The filler partner of an unpaired co-op run: no profile to link to. */
  unknown?: boolean
}

/** The map a run is on: the catalog's, or what the row itself says when the catalog lacks it. */
export type RunMap = Pick<MapInfo, 'id' | 'title' | 'mode' | 'game' | 'chapter'> & Partial<MapInfo>

/** A changelog entry as the site shows it. */
export interface Run {
  id: number
  game: string
  timestamp: string | null
  map: RunMap
  score: number
  preRank: number | null
  postRank: number | null
  scoreDelta: number | null
  /** Points on the map after the run minus before; null for pending and banned runs. */
  pointsDelta: number | null
  /** Co-op: blue (host) first, orange second. */
  players: Player[]
  /** Whose half of the run this row is (for co-op, the player who set a PB with it). */
  submitter: string
  youtubeId: string | null
  autorenderId: string | null
  demoId: number | null
  portals: number | null
  note: string | null
  verified: boolean
  banned: boolean
  coopId: number | null
  reactionsUp: number
  reactionsDown: number
  /** Co-op: whether it's known who hosted; null for single player. */
  rolesKnown: boolean | null
  sarVersion: string | null
  /** The old board had no date: estimated from the runs around it. */
  dateEstimated: boolean
  /** Staff's WR history only: removed from the map's WR history. */
  wrHidden?: boolean
}

/** A row of a map's board. */
export interface RankedRun {
  changelogId: number | null
  /** Co-op: both halves' changelog entries. */
  changelogIds?: [number | null, number | null]
  coopId?: number | null
  rolesKnown?: boolean
  rank: number
  score: number
  points: number
  timestamp: string | null
  youtubeId: string | null
  autorenderId: string | null
  demoId: number | null
  note: string | null
  portals: number | null
  sarVersion: string | null
  players: Player[]
}

/** One of the top runs shown on a map card. */
export interface PreviewRun {
  score: number
  youtubeId: string | null
  autorenderId: string | null
  demoId: null
  players: Player[]
}

/** One player's half of a co-op run. */
export interface CoopHalf {
  player: Player | null
  isHost: boolean | null
  changelogId: number | null
  score: number | null
  timestamp: string | null
  note: string | null
  youtubeId: string | null
  autorenderId: string | null
  demoId: number | null
  hasSegments: boolean
  portals: number | null
  sarVersion: string | null
}
