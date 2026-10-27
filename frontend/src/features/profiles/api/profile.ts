import { queryOptions } from '@tanstack/react-query'
import { player } from '@/lib/adapters/runs'
import { api } from '@/lib/api-client'
import { findMap, gameIdParam, getMap, PORTAL2, type Catalog } from '@/lib/catalog'
import { queryKeys } from '@/lib/query-keys'
import { getGameRanks, getPlayerRuns } from '@/lib/runs/player-runs'
import { getProfileScores } from '@/lib/runs/profile-scores'
import type {
  AggregateRowRaw,
  GameResults,
  PointsPeak,
  Profile,
  ProfileAtRaw,
  ProfilePageRaw,
  ProfileStats,
  ProfileStatsRaw,
  UserRaw,
} from '../types'
import type { PointsSample } from '../utils/points-chart'
import { adaptProfile, scoresFromRanks } from '../utils/profile'
import { gameSlots, toSlots } from '../utils/summary'

/** A player's Portal 2 profile: points, places, best runs on every map and every run. */
export async function getProfile(c: Catalog, profileNumber: string, signal?: AbortSignal): Promise<Profile> {
  const [page, user, history, pbs] = await Promise.all([
    api.get<ProfilePageRaw>(`/profile/${profileNumber}`, { signal }),
    api.get<UserRaw>(`/user/${profileNumber}`, { signal }),
    getPlayerRuns(c, profileNumber, PORTAL2, 5000, signal),
    getProfileScores(profileNumber, signal),
  ])
  return adaptProfile(c, profileNumber, page, user, history, pbs)
}

export const profileQueryOptions = (c: Catalog, profileNumber: string) =>
  queryOptions({
    queryKey: [...queryKeys.profile(profileNumber), 'page', c.fromServer],
    queryFn: ({ signal }) => getProfile(c, profileNumber, signal),
  })

/**
 * Each of a game's boards' highest points and when, on the profile's slots (another game's first
 * and second boards in `sp` and `coop`); {} when the server can't say (legacy did the same).
 */
export const getPointsPeak = (c: Catalog, profileNumber: string, game: string, signal?: AbortSignal) =>
  api
    .get<Record<string, { points: number; date: string }>>(`/profile/points_peak/${profileNumber}`, {
      params: gameIdParam(c, game),
      signal,
    })
    .then((raw): PointsPeak => toSlots(gameSlots(c, game), raw))
    .catch(() => ({}) as PointsPeak)

export const pointsPeakQueryOptions = (c: Catalog, profileNumber: string, game: string = PORTAL2) =>
  queryOptions({
    queryKey: [...queryKeys.profilePointsPeak(profileNumber, game), c.fromServer],
    queryFn: ({ signal }) => getPointsPeak(c, profileNumber, game, signal),
  })

/** Where the player stood at the end of a past day (YYYY-MM-DD). */
export const getProfileAt = (profileNumber: string, at: string, signal?: AbortSignal) =>
  api.get<ProfileAtRaw>(`/profile/at/${profileNumber}`, { params: { at }, signal })

/** The player's place on every aggregated board of a game, now or as of a day (YYYY-MM-DD). */
export const getAggregated = (
  c: Catalog,
  profileNumber: string,
  game: string,
  at: string | null,
  signal?: AbortSignal,
) =>
  api.get<AggregateRowRaw[]>(`/profile/aggregated/${profileNumber}`, {
    params: { game_id: gameIdParam(c, game).game_id ?? 1, ...(at ? { at } : {}) },
    signal,
  })

export const aggregatedQueryOptions = (c: Catalog, profileNumber: string, game: string, at: string | null) =>
  queryOptions({
    queryKey: [...queryKeys.profileAggregated(profileNumber, at, game), c.fromServer],
    queryFn: ({ signal }) => getAggregated(c, profileNumber, game, at, signal),
  })

export const profileAtQueryOptions = (profileNumber: string, at: string) =>
  queryOptions({
    queryKey: queryKeys.profileAt(profileNumber, at),
    queryFn: ({ signal }) => getProfileAt(profileNumber, at, signal),
  })

/** A player's results in another game (Mel, a custom game, a season): ranks and runs. */
export async function getGameResults(
  c: Catalog,
  profileNumber: string,
  game: string,
  signal?: AbortSignal,
): Promise<GameResults> {
  const [ranks, history] = await Promise.all([
    getGameRanks(c, profileNumber, game, signal),
    // Every run (the Stats tab lists them all), as for Portal 2.
    getPlayerRuns(c, profileNumber, game, 5000, signal),
  ])
  return { scores: scoresFromRanks(c, profileNumber, ranks, history, game), history }
}

export const gameResultsQueryOptions = (c: Catalog, profileNumber: string, game: string) =>
  queryOptions({
    queryKey: [...queryKeys.profileGame(profileNumber, game), c.fromServer],
    queryFn: ({ signal }) => getGameResults(c, profileNumber, game, signal),
  })

/**
 * A player's real points over time in a game (ranks recomputed against everyone's bests at each
 * date), rounded as legacy showed them, on the profile's slots.
 */
export async function getPointsHistory(
  c: Catalog,
  profileNumber: string,
  game: string,
  signal?: AbortSignal,
): Promise<PointsSample[]> {
  const rows = await api.get<({ date: string } & Record<string, number | string | null>)[]>(
    `/profile/points_history/${profileNumber}`,
    { params: gameIdParam(c, game), signal },
  )
  const slots = gameSlots(c, game)
  const value = (row: Record<string, number | string | null>, key: string) => {
    const serverKey = slots.find((s) => s.key === key)?.serverKey
    return Math.round(Number((serverKey && row[serverKey]) ?? 0))
  }
  return rows.map((p) => ({
    date: p.date,
    sp: value(p, 'sp'),
    coop: value(p, 'coop'),
    overall: value(p, 'overall'),
  }))
}

export const pointsHistoryQueryOptions = (c: Catalog, profileNumber: string, game: string = PORTAL2) =>
  queryOptions({
    queryKey: [...queryKeys.profilePointsHistory(profileNumber, game), c.fromServer],
    queryFn: ({ signal }) => getPointsHistory(c, profileNumber, game, signal),
  })

/** A player's stats in a game: activity, co-op partners and portal counts from demos. */
export async function getProfileStats(
  c: Catalog,
  profileNumber: string,
  game: string,
  signal?: AbortSignal,
): Promise<ProfileStats> {
  const s = await api.get<ProfileStatsRaw>(`/profile/stats/${profileNumber}`, {
    params: gameIdParam(c, game),
    signal,
  })
  return {
    summary: s.summary,
    uniquePartners: s.unique_partners,
    partners: s.partners.map((p) => ({
      player: player(p.profile_number, p.user_name, p.avatar),
      maps: p.maps,
      runs: p.runs,
    })),
    fewestPortals: s.fewest_portals.map((f) => ({
      map: getMap(c, f.map_id, game) ?? findMap(c, f.map_id) ?? null,
      mapName: f.map_name,
      score: f.score,
      portals: f.portals,
    })),
  }
}

export const profileStatsQueryOptions = (c: Catalog, profileNumber: string, game: string) =>
  queryOptions({
    queryKey: [...queryKeys.profileStats(profileNumber, game), c.fromServer],
    queryFn: ({ signal }) => getProfileStats(c, profileNumber, game, signal),
  })
