import { queryOptions } from '@tanstack/react-query'
import { player } from '@/lib/adapters/runs'
import { api } from '@/lib/api-client'
import { findMap, gameIdParam, getMap, type Catalog } from '@/lib/catalog'
import { queryKeys } from '@/lib/query-keys'
import type { Player, RunMap } from '@/types/runs'

// --- raw API types (server handlers/stats.rs) ---------------------------------------------

interface PlayerRaw {
  profile_number: string
  user_name: string | null
  avatar: string | null
}

interface WhereRaw {
  map_id: string
  map_name: string
  is_coop: boolean
}

interface TeamRaw {
  players: PlayerRaw[]
  since: string | null
}

export interface SiteStatsRaw {
  totals: {
    runners: number
    runs: number
    world_records: number
    demos: number
    rendered: number
    maps: number
    countries: number
    runs_year: number
    runners_year: number
  }
  leaders: Record<string, (PlayerRaw & { value: number })[]>
  longest_wrs: (WhereRaw & {
    score: number
    since: string
    profile_number: string
    user_name: string | null
    avatar: string | null
    partner_number: string | null
    partner_name: string | null
    partner_avatar: string | null
  })[]
  peaks: Record<string, (PlayerRaw & { points: number; date: string; current: number })[]>
}

export interface WrStatsRaw {
  records: (WhereRaw & {
    mode: string
    score: number
    since: string
    days: number
    teams: TeamRaw[]
    records: number
  })[]
  total_time: Record<string, number>
  holders: { player: PlayerRaw; held: number; days: number; set: number }[]
  longest: (WhereRaw & {
    score: number
    start: string
    end: string | null
    days: number
    teams: TeamRaw[]
    beaten_by: TeamRaw[] | null
    beaten_with: number | null
  })[]
  domination: (WhereRaw & {
    player: PlayerRaw
    start: string
    end: string | null
    days: number
    records: number
    from_score: number
    to_score: number
  })[]
  improvements: (WhereRaw & {
    from_score: number
    to_score: number
    delta: number
    date: string
    teams: TeamRaw[]
    previous: TeamRaw[] | null
    previous_days: number
  })[]
  race: Record<string, { frames: { date: string; top: [string, number][] }[] }>
  race_players: Record<string, PlayerRaw>
}

// --- the site's stats -------------------------------------------------------------------

export interface Team {
  players: Player[]
  since: string | null
}

/** Where a record is: the map (when the catalog has it), its name and whether it's co-op. */
export interface RecordWhere {
  mapId: string
  map: RunMap | null
  mapName: string
  isCoop: boolean
}

export interface Leader {
  player: Player
  value: number
}

export interface SiteStats {
  totals: {
    runners: number
    runs: number
    worldRecords: number
    demos: number
    rendered: number
    maps: number
    countries: number
    runsYear: number
    runnersYear: number
  }
  leaders: Record<string, Leader[]>
  longestWrs: (RecordWhere & { score: number; since: string; players: Player[] })[]
  peaks: Record<string, { player: Player; points: number; date: string; current: number }[]>
}

export interface WrStats {
  records: (RecordWhere & {
    mode: string
    score: number
    since: string
    days: number
    teams: Team[]
    records: number
  })[]
  totalTime: Record<string, number>
  holders: { player: Player; held: number; days: number; set: number }[]
  longest: (RecordWhere & {
    score: number
    start: string
    end: string | null
    days: number
    teams: Team[]
    beatenBy: Team[]
    beatenWith: number | null
  })[]
  domination: (RecordWhere & {
    player: Player
    start: string
    end: string | null
    days: number
    records: number
    fromScore: number
    toScore: number
  })[]
  improvements: (RecordWhere & {
    fromScore: number
    toScore: number
    delta: number
    date: string
    teams: Team[]
    previous: Team[]
    previousDays: number
  })[]
  race: Record<string, { frames: { date: string; top: { profileNumber: string; held: number }[] }[] }>
  racePlayers: Record<string, Player>
}

const pl = (p: PlayerRaw) => player(p.profile_number, p.user_name, p.avatar)
const teams = (ts: TeamRaw[] | null | undefined): Team[] =>
  (ts ?? []).map((t) => ({ players: t.players.map(pl), since: t.since }))
const lookupMap = (c: Catalog, id: string, game: string) => getMap(c, id, game) ?? findMap(c, id) ?? null
const where = (c: Catalog, game: string, r: WhereRaw): RecordWhere => ({
  mapId: r.map_id,
  map: lookupMap(c, r.map_id, game),
  mapName: r.map_name,
  isCoop: r.is_coop,
})

export function adaptSiteStats(c: Catalog, game: string, s: SiteStatsRaw): SiteStats {
  const t = s.totals
  return {
    totals: {
      runners: t.runners,
      runs: t.runs,
      worldRecords: t.world_records,
      demos: t.demos,
      rendered: t.rendered,
      maps: t.maps,
      countries: t.countries,
      runsYear: t.runs_year,
      runnersYear: t.runners_year,
    },
    leaders: Object.fromEntries(
      Object.entries(s.leaders).map(([k, rows]) => [k, rows.map((r) => ({ player: pl(r), value: r.value }))]),
    ),
    longestWrs: s.longest_wrs.map((w) => ({
      ...where(c, game, w),
      score: w.score,
      since: w.since,
      players: [
        player(w.profile_number, w.user_name, w.avatar),
        ...(w.partner_number ? [player(w.partner_number, w.partner_name, w.partner_avatar)] : []),
      ],
    })),
    peaks: Object.fromEntries(
      Object.entries(s.peaks).map(([k, rows]) => [
        k,
        rows.map((r) => ({ player: pl(r), points: r.points, date: r.date, current: r.current })),
      ]),
    ),
  }
}

export function adaptWrStats(c: Catalog, game: string, s: WrStatsRaw): WrStats {
  return {
    records: s.records.map((r) => ({
      ...where(c, game, r),
      mode: r.mode,
      score: r.score,
      since: r.since,
      days: r.days,
      teams: teams(r.teams),
      records: r.records,
    })),
    totalTime: s.total_time,
    holders: s.holders.map((h) => ({ player: pl(h.player), held: h.held, days: h.days, set: h.set })),
    longest: s.longest.map((r) => ({
      ...where(c, game, r),
      score: r.score,
      start: r.start,
      end: r.end,
      days: r.days,
      teams: teams(r.teams),
      beatenBy: teams(r.beaten_by),
      beatenWith: r.beaten_with,
    })),
    domination: s.domination.map((r) => ({
      ...where(c, game, r),
      player: pl(r.player),
      start: r.start,
      end: r.end,
      days: r.days,
      records: r.records,
      fromScore: r.from_score,
      toScore: r.to_score,
    })),
    improvements: s.improvements.map((r) => ({
      ...where(c, game, r),
      fromScore: r.from_score,
      toScore: r.to_score,
      delta: r.delta,
      date: r.date,
      teams: teams(r.teams),
      previous: teams(r.previous),
      previousDays: r.previous_days,
    })),
    race: Object.fromEntries(
      Object.entries(s.race).map(([k, r]) => [
        k,
        {
          frames: r.frames.map((f) => ({
            date: f.date,
            top: f.top.map(([pn, n]) => ({ profileNumber: pn, held: n })),
          })),
        },
      ]),
    ),
    racePlayers: Object.fromEntries(Object.entries(s.race_players).map(([k, p]) => [k, pl(p)])),
  }
}

/** Site-wide runner stats for a game (GET /stats/site). */
export const getSiteStats = async (c: Catalog, game: string, signal?: AbortSignal) =>
  adaptSiteStats(
    c,
    game,
    await api.get<SiteStatsRaw>('/stats/site', { params: gameIdParam(c, game), signal }),
  )

export const siteStatsQueryOptions = (c: Catalog, game: string) =>
  queryOptions({
    queryKey: [...queryKeys.siteStats(game), c.fromServer],
    queryFn: ({ signal }) => getSiteStats(c, game, signal),
  })

/** World record stats for a game (GET /stats/wr): the Records, History and Race pages, and record-days. */
export const getWrStats = async (c: Catalog, game: string, signal?: AbortSignal) =>
  adaptWrStats(c, game, await api.get<WrStatsRaw>('/stats/wr', { params: gameIdParam(c, game), signal }))

export const wrStatsQueryOptions = (c: Catalog, game: string) =>
  queryOptions({
    queryKey: [...queryKeys.wrStats(game), c.fromServer],
    queryFn: ({ signal }) => getWrStats(c, game, signal),
  })
