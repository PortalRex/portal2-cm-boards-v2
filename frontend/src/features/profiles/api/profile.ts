import { queryOptions } from '@tanstack/react-query'
import { adaptChangelog } from '@/lib/adapters/runs'
import { api } from '@/lib/api-client'
import { gameIdParam, PORTAL2, type Catalog } from '@/lib/catalog'
import { queryKeys } from '@/lib/query-keys'
import { getProfileScores } from '@/lib/runs/profile-scores'
import type { ChangelogRaw } from '@/types/runs'
import type { GameResults, PointsPeak, Profile, ProfileAtRaw, ProfilePageRaw, UserRaw } from '../types'
import type { PointsSample } from '../utils/points-chart'
import { adaptProfile, scoresFromRanks } from '../utils/profile'

/** The player's runs as the profile lists them (legacy asked for them unfiltered, banned included). */
const getRuns = async (
  c: Catalog,
  profileNumber: string,
  game: string,
  limit: number,
  signal?: AbortSignal,
) =>
  (
    await api.get<ChangelogRaw[]>('/changelog', {
      params: { profile_number: profileNumber, limit, ...gameIdParam(c, game) },
      signal,
    })
  ).map((r) => adaptChangelog(r, game, c))

/** A player's Portal 2 profile: points, places, best runs on every map and every run. */
export async function getProfile(c: Catalog, profileNumber: string, signal?: AbortSignal): Promise<Profile> {
  const [page, user, history, pbs] = await Promise.all([
    api.get<ProfilePageRaw>(`/profile/${profileNumber}`, { signal }),
    api.get<UserRaw>(`/user/${profileNumber}`, { signal }),
    getRuns(c, profileNumber, PORTAL2, 5000, signal),
    getProfileScores(profileNumber, signal),
  ])
  return adaptProfile(c, profileNumber, page, user, history, pbs)
}

export const profileQueryOptions = (c: Catalog, profileNumber: string) =>
  queryOptions({
    queryKey: [...queryKeys.profile(profileNumber), 'page', c.fromServer],
    queryFn: ({ signal }) => getProfile(c, profileNumber, signal),
  })

/** Each board's highest points and when; {} when the server can't say (legacy did the same). */
export const getPointsPeak = (profileNumber: string, signal?: AbortSignal) =>
  api.get<PointsPeak>(`/profile/points_peak/${profileNumber}`, { signal }).catch(() => ({}) as PointsPeak)

export const pointsPeakQueryOptions = (profileNumber: string) =>
  queryOptions({
    queryKey: queryKeys.profilePointsPeak(profileNumber),
    queryFn: ({ signal }) => getPointsPeak(profileNumber, signal),
  })

/** Where the player stood at the end of a past day (YYYY-MM-DD). */
export const getProfileAt = (profileNumber: string, at: string, signal?: AbortSignal) =>
  api.get<ProfileAtRaw>(`/profile/at/${profileNumber}`, { params: { at }, signal })

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
    api.get<Record<string, number>>(`/ranks/game/${c.games[game]?.dbId}/${profileNumber}`, { signal }),
    getRuns(c, profileNumber, game, 500, signal),
  ])
  return { scores: scoresFromRanks(c, profileNumber, ranks, history, game), history }
}

export const gameResultsQueryOptions = (c: Catalog, profileNumber: string, game: string) =>
  queryOptions({
    queryKey: [...queryKeys.profileGame(profileNumber, game), c.fromServer],
    queryFn: ({ signal }) => getGameResults(c, profileNumber, game, signal),
  })

/**
 * A player's real points over time (ranks recomputed against everyone's bests at each date),
 * rounded as legacy showed them.
 */
export async function getPointsHistory(profileNumber: string, signal?: AbortSignal): Promise<PointsSample[]> {
  const rows = await api.get<
    { date: string; sp?: number | null; coop?: number | null; overall?: number | null }[]
  >(`/profile/points_history/${profileNumber}`, { signal })
  return rows.map((p) => ({
    date: p.date,
    sp: Math.round(p.sp ?? 0),
    coop: Math.round(p.coop ?? 0),
    overall: Math.round(p.overall ?? 0),
  }))
}

export const pointsHistoryQueryOptions = (profileNumber: string) =>
  queryOptions({
    queryKey: queryKeys.profilePointsHistory(profileNumber),
    queryFn: ({ signal }) => getPointsHistory(profileNumber, signal),
  })
