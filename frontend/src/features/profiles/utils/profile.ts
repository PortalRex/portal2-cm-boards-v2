import { getMap, PORTAL2, type Catalog } from '@/lib/catalog'
import { countryById } from '@/lib/data/countries'
import { parseTimestamp } from '@/lib/format'
import { pointsForRank } from '@/lib/points'
import { latestRuns } from '@/lib/runs/player-runs'
import type { ProfileScoreRaw } from '@/lib/runs/profile-scores'
import type { Run } from '@/types/runs'
import type {
  BoardNumbers,
  MapScore,
  Profile,
  ProfileAtRaw,
  ProfileBadge,
  ProfileDateRaw,
  ProfilePageRaw,
  ScoreBrief,
  UserRaw,
} from '../types'

// Port of legacy api/client.js adaptProfile / scoresFromRanks / mergePbs / profileAsOf.

const time = (ts: string | null | undefined) => parseTimestamp(ts)?.getTime() ?? 0

/** The player's partner on a co-op run. */
const partnerOf = (run: Run | undefined, me: string) =>
  run?.players.find((p) => p.profileNumber !== me) ?? null

/** Ranks by map id ({ map_id: rank }) combined with the player's latest run on each map. */
export function scoresFromRanks(
  c: Catalog,
  profileNumber: string,
  ranks: Record<string, number> | null | undefined,
  history: Run[],
  game: string,
): Record<string, MapScore> {
  const latest = latestRuns(history)
  const scores: Record<string, MapScore> = {}
  for (const [mapId, rank] of Object.entries(ranks ?? {})) {
    const map = getMap(c, mapId, game)
    if (!map) continue
    const h = latest[mapId]
    scores[mapId] = {
      map,
      rank,
      score: h?.score ?? null,
      timestamp: h?.timestamp ?? null,
      deltaNext: null,
      deltaWr: null,
      points: pointsForRank(rank),
      youtubeId: h?.youtubeId ?? null,
      changelogId: h?.id ?? null,
      autorenderId: h?.autorenderId ?? null,
      demoId: h?.demoId ?? null,
      note: h?.note ?? null,
      partner: partnerOf(h, profileNumber),
    }
  }
  return scores
}

/**
 * Personal bests (GET /profile/scores) fill in times and deltas; maps where the player is outside
 * the ranked results get an entry without a rank. The run's own details come from the best run
 * itself, not the latest run on the map (a later, slower or banned run would lend it its partner,
 * demo and video).
 */
export function mergePbs(
  c: Catalog,
  scores: Record<string, MapScore>,
  pbs: ProfileScoreRaw[],
  history: Run[],
  me: string,
): Record<string, MapScore> {
  const byId = new Map(history.map((h) => [h.id, h]))
  const out = { ...scores }
  for (const pb of pbs) {
    const map = getMap(c, pb.map_id)
    if (!map) continue
    const h = pb.changelog_id != null ? byId.get(pb.changelog_id) : undefined
    const base: MapScore = out[pb.map_id] ?? {
      map,
      rank: pb.rank ?? null,
      points: pb.rank ? pointsForRank(pb.rank) : null,
      score: null,
      timestamp: null,
      deltaNext: null,
      deltaWr: null,
      youtubeId: h?.youtubeId ?? null,
      changelogId: pb.changelog_id,
      autorenderId: h?.autorenderId ?? null,
      demoId: h?.demoId ?? null,
      note: h?.note ?? null,
      portals: h?.portals ?? null,
      sarVersion: h?.sarVersion ?? null,
      partner: null,
    }
    const run: Partial<MapScore> = h
      ? {
          changelogId: h.id,
          youtubeId: h.youtubeId,
          autorenderId: h.autorenderId,
          demoId: h.demoId,
          note: h.note,
          portals: h.portals,
          sarVersion: h.sarVersion,
          dateEstimated: h.dateEstimated,
          partner: partnerOf(h, me),
        }
      : { changelogId: pb.changelog_id }
    out[pb.map_id] = {
      ...base,
      ...run,
      score: pb.score,
      timestamp: pb.timestamp,
      deltaWr: pb.delta_to_wr ?? null,
      deltaNext: pb.delta_to_next ?? null,
    }
  }
  return out
}

const ROLE_BADGES: Record<string, string> = { verifier: 'Verifier', moderator: 'Moderator', admin: 'Admin' }

/** The old boards kept a player's titles in one field ("Original Developer, Donator"). */
export const splitTitles = (title: string | null | undefined): string[] =>
  (title ?? '')
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean)

/** Average rank, world records, best and worst place over the ranked maps. */
function placeStats(scores: Record<string, MapScore>) {
  const ranked = Object.values(scores).filter((s): s is MapScore & { rank: number } => s.rank != null)
  const avg = (mode: keyof BoardNumbers<unknown>) => {
    const list = ranked.filter((s) => mode === 'overall' || s.map.mode === mode)
    return list.length ? list.reduce((a, s) => a + s.rank, 0) / list.length : null
  }
  const sorted = [...ranked].sort((a, b) => a.rank - b.rank)
  const wrs = (mode: string) => ranked.filter((s) => s.map.mode === mode && s.rank === 1).length
  return {
    averagePlace: { sp: avg('sp'), coop: avg('coop'), overall: avg('overall') },
    worldRecords: { sp: wrs('sp'), coop: wrs('coop') },
    best: sorted[0] ?? null,
    worst: sorted[sorted.length - 1] ?? null,
  }
}

/** GET /profile, /user, the player's changelog and personal bests -> the profile page's data. */
export function adaptProfile(
  c: Catalog,
  profileNumber: string,
  page: ProfilePageRaw,
  user: UserRaw,
  history: Run[],
  pbs: ProfileScoreRaw[],
): Profile {
  const entry = (id: number) => (page.points ?? []).find((p) => p.id === id)
  const scores = mergePbs(
    c,
    scoresFromRanks(c, profileNumber, page.ranks, history, PORTAL2),
    pbs,
    history,
    profileNumber,
  )
  const fromDate = (d: ProfileDateRaw | null | undefined): ScoreBrief | null =>
    d ? { map: getMap(c, d.map) ?? { title: d.map_name }, score: d.score, timestamp: d.timestamp } : null
  const dates = page.data ?? {}
  const newest = [dates.newest_sp, dates.newest_coop]
    .filter((d): d is ProfileDateRaw => Boolean(d))
    .sort((a, b) => time(b.timestamp) - time(a.timestamp))[0]
  const oldest = [dates.oldest_sp, dates.oldest_coop]
    .filter((d): d is ProfileDateRaw => Boolean(d))
    .sort((a, b) => time(a.timestamp) - time(b.timestamp))[0]
  const titles = splitTitles(user.title)
  const role = user.role || null
  const badges: ProfileBadge[] = titles.map((label) => ({ label, tone: 'teal' }))
  if (role && ROLE_BADGES[role])
    badges.push({ label: ROLE_BADGES[role], tone: role === 'admin' ? 'red' : 'staff' })
  return {
    player: {
      profileNumber,
      name: user.board_name || user.steam_name || '',
      avatar: user.avatar,
      country: countryById(user.country_id)?.code ?? null,
      badges,
      titles,
      role,
      twitch: user.twitch || null,
      youtube: user.youtube || null,
      banned: Boolean(user.banned),
      steamName: user.steam_name || null,
      nameLocked: Boolean(user.name_locked),
      avatarLocked: Boolean(user.avatar_locked),
      avatarCustom: Boolean(user.avatar_custom),
      legendsAt: user.legends_at || null,
      frozen: Boolean(user.frozen),
      frozenReason: user.frozen_reason || null,
      steam: profileNumber,
    },
    points: {
      sp: entry(-1)?.points?.points ?? 0,
      coop: entry(-2)?.points?.points ?? 0,
      overall: entry(-3)?.points?.points ?? 0,
    },
    globalRank: {
      sp: entry(-1)?.place ?? null,
      coop: entry(-2)?.place ?? null,
      overall: entry(-3)?.place ?? null,
      country: entry(-3)?.country_place ?? null,
    },
    ...placeStats(scores),
    newest: fromDate(newest),
    oldest: fromDate(oldest),
    scores,
    history,
  }
}

/**
 * The profile as it was at the end of a past day (YYYY-MM-DD): points, places and best times then
 * (GET /profile/at). Runs after that day are left out of its history.
 */
export function profileAsOf(c: Catalog, profile: Profile, past: ProfileAtRaw, at: string): Profile {
  const me = profile.player.profileNumber
  const end = Date.parse(`${at}T23:59:59Z`)
  const history = profile.history.filter((h) => !h.timestamp || time(h.timestamp) <= end)
  const byId = new Map(profile.history.map((h) => [h.id, h]))
  const scores: Record<string, MapScore> = {}
  for (const m of past.maps ?? []) {
    const map = getMap(c, m.map_id)
    if (!map) continue
    const h = byId.get(m.changelog_id)
    scores[m.map_id] = {
      map,
      rank: m.rank,
      score: m.score,
      timestamp: m.timestamp,
      points: m.points,
      deltaNext: null,
      deltaWr: null,
      youtubeId: h?.youtubeId ?? null,
      changelogId: m.changelog_id,
      autorenderId: h?.autorenderId ?? null,
      demoId: h?.demoId ?? null,
      note: h?.note ?? null,
      partner: partnerOf(h, me),
    }
  }
  const dated = history
    .filter((h) => h.timestamp && !h.banned)
    .sort((a, b) => time(a.timestamp) - time(b.timestamp))
  const brief = (h: Run | undefined): ScoreBrief | null =>
    h ? { map: h.map, score: h.score, timestamp: h.timestamp } : null
  return {
    ...profile,
    asOf: at,
    points: {
      sp: past.points?.sp ?? 0,
      coop: past.points?.coop ?? 0,
      overall: past.points?.overall ?? 0,
    },
    globalRank: {
      sp: past.places?.sp ?? null,
      coop: past.places?.coop ?? null,
      overall: past.places?.overall ?? null,
      country: past.country_place ?? null,
    },
    ...placeStats(scores),
    newest: brief(dated[dated.length - 1]),
    oldest: brief(dated[0]),
    scores,
    history,
  }
}

/** ?at=YYYY-MM-DD: the profile as it was that day (picked on the points chart). */
export const validDay = (at: string | undefined): string | null =>
  at && /^\d{4}-\d{2}-\d{2}$/.test(at) ? at : null
