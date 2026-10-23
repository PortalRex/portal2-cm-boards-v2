import { findMap, getMap, type Catalog } from '@/lib/catalog'
import { pointsForRank } from '@/lib/points'
import type {
  ChangelogRaw,
  CoopHalf,
  CoopHalfRaw,
  CoopPreviewRaw,
  CoopRankedRaw,
  Player,
  PreviewRun,
  RankedRun,
  Run,
  RunMap,
  SpPreviewRaw,
  SpRankedRaw,
} from '@/types/runs'

// Raw run rows -> the site's run objects (legacy api/client.js adapters).

export const player = (
  profileNumber: string | null | undefined,
  name: string | null | undefined,
  avatar?: string | null,
): Player => ({ profileNumber: profileNumber ?? null, name: name || 'Unknown', avatar: avatar || null })

// Unpaired co-op runs are bundled with a filler user ("N/A") in the database; they show an
// "Unknown partner" with a default picture (no profile to link to).
const FILLER = 'N/A'
export const UNKNOWN_PARTNER_AVATAR = '/unknown-partner.svg'

export const unknownPartner = (): Player => ({
  profileNumber: null,
  name: 'Unknown partner',
  avatar: UNKNOWN_PARTNER_AVATAR,
  unknown: true,
})

const realPlayers = (players: Player[]): Player[] =>
  players.map((p) => (p.profileNumber === FILLER || p.name === FILLER ? unknownPartner() : p))

/** Map ids are Steam leaderboard ids for Portal 2 and board ids (1-44) for Mel. */
const lookupMap = (c: Catalog, id: string, game: string) => getMap(c, id, game) ?? findMap(c, id)

export function adaptChangelog(row: ChangelogRaw, game: string, c: Catalog): Run {
  const isCoop = row.coop_id != null && Boolean(row.blue_name || row.orange_name)
  // Co-op players come blue (host) first, orange second.
  const players = isCoop
    ? realPlayers([
        player(row.blue_profile_number, row.blue_name, row.blue_avatar),
        player(row.orange_profile_number, row.orange_name, row.orange_avatar),
      ])
    : [player(row.profile_number, row.user_name, row.avatar)]
  // Older servers don't send the co-op profile numbers; the submitter is one of the two players.
  for (const p of players) {
    if (!p.profileNumber && !p.unknown && p.name === row.user_name) p.profileNumber = row.profile_number
  }
  const map: RunMap = lookupMap(c, row.map_id, game) ?? {
    id: row.map_id,
    title: row.map_name,
    chapter: '',
    mode: isCoop ? 'coop' : 'sp',
    game,
  }
  const counts = row.post_rank != null && row.verified !== false && !row.banned
  return {
    id: row.id,
    game: map.game || game,
    timestamp: row.timestamp,
    map,
    score: row.score,
    preRank: row.pre_rank,
    postRank: row.post_rank,
    scoreDelta: row.score_delta,
    pointsDelta: counts
      ? Math.round(pointsForRank(row.post_rank!) - (row.pre_rank != null ? pointsForRank(row.pre_rank) : 0))
      : null,
    players,
    submitter: row.profile_number,
    youtubeId: row.youtube_id,
    autorenderId: row.autorender_id ?? null,
    demoId: row.demo_id,
    portals: row.portals ?? null,
    note: row.note,
    verified: row.verified !== false,
    banned: Boolean(row.banned),
    coopId: isCoop ? row.coop_id : null,
    reactionsUp: row.reactions_up ?? 0,
    reactionsDown: row.reactions_down ?? 0,
    rolesKnown: isCoop ? row.coop_roles_known !== false : null,
    sarVersion: row.sar_version ?? null,
    dateEstimated: Boolean(row.date_estimated),
  }
}

export function adaptSpRanked(row: SpRankedRaw): RankedRun {
  const d = row.map_data
  return {
    changelogId: d.cl_id ?? null,
    rank: row.rank,
    score: d.score,
    points: row.points,
    timestamp: d.timestamp,
    youtubeId: d.youtube_id,
    autorenderId: d.autorender_id ?? null,
    demoId: d.demo_id,
    note: d.note,
    portals: d.portals ?? null,
    sarVersion: d.sar_version ?? null,
    players: [player(d.profile_number, d.user_name, d.avatar)],
  }
}

// Co-op players are shown blue (host) first, orange second. p1_is_host is false when the second
// player hosted; when it's unknown the stored order is kept.
const hostFirst = (isHost: boolean | null, [first, second]: [Player, Player]): [Player, Player] =>
  isHost === false ? [second, first] : [first, second]

export function adaptCoopRanked(row: CoopRankedRaw): RankedRun {
  const d = row.map_data
  return {
    changelogId: d.cl_id1 ?? d.cl_id2 ?? null,
    changelogIds: [d.cl_id1, d.cl_id2],
    coopId: d.coop_id ?? null,
    rolesKnown: d.p1_is_host != null,
    rank: row.rank,
    score: d.score,
    points: row.points,
    timestamp: d.timestamp,
    youtubeId: d.youtube_id1 || d.youtube_id2,
    autorenderId: d.autorender_id1 || d.autorender_id2 || null,
    demoId: d.demo_id1 || d.demo_id2,
    note: d.note1 || d.note2,
    // Each half's own are shown once the halves load (Run Details); these cover the moment before.
    portals: d.portals1 ?? d.portals2 ?? null,
    sarVersion: d.sar_version1 || d.sar_version2 || null,
    players: realPlayers(
      hostFirst(d.p1_is_host, [
        player(d.profile_number1, d.user_name1, d.avatar1),
        player(d.profile_number2, d.user_name2, d.avatar2),
      ]),
    ),
  }
}

export function adaptPreview(row: SpPreviewRaw | CoopPreviewRaw): PreviewRun {
  if ('user_name1' in row) {
    return {
      score: row.score,
      youtubeId: row.youtube_id1 || row.youtube_id2,
      autorenderId: row.autorender_id ?? null,
      demoId: null,
      players: realPlayers([
        player(row.profile_number1, row.user_name1),
        player(row.profile_number2, row.user_name2),
      ]),
    }
  }
  return {
    score: row.score,
    youtubeId: row.youtube_id,
    autorenderId: row.autorender_id ?? null,
    demoId: null,
    players: [player(row.profile_number, row.user_name)],
  }
}

/** Both players' halves of a co-op run. A half without a run of its own has changelogId null. */
export const adaptCoopHalf = (h: CoopHalfRaw): CoopHalf => ({
  player: h.profile_number ? player(h.profile_number, h.user_name, h.avatar) : null,
  isHost: h.is_host,
  changelogId: h.changelog_id,
  score: h.score,
  timestamp: h.timestamp,
  note: h.note,
  youtubeId: h.youtube_id,
  autorenderId: h.autorender_id,
  demoId: h.demo_id,
  hasSegments: h.has_segments,
  portals: h.portals ?? null,
  sarVersion: h.sar_version ?? null,
})
