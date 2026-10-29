import { queryOptions } from '@tanstack/react-query'
import { adaptChangelog } from '@/lib/adapters/runs'
import { api } from '@/lib/api-client'
import { findMap, gameIdParam, getMap, type Catalog, type MapInfo } from '@/lib/catalog'
import { queryKeys } from '@/lib/query-keys'
import { getChangelog } from '@/lib/runs/changelog'
import type { ActivityDay } from '@/lib/activity'
import type { ChangelogRaw, Run } from '@/types/runs'

// The panels above the score updates: weekly recap, daily chambers, following, activity.

const day = (d: Date) => d.toISOString().slice(0, 10)

export interface WeeklyRecapRaw {
  start: string
  end: string
  runs: ChangelogRaw[]
}

export interface WeeklyRecap {
  start: string
  end: string
  runs: Run[]
}

/** The top 5 runs of the week containing `date` (weeks start on Monday, UTC). */
export async function getWeeklyRecap(
  game: string,
  date: Date,
  c: Catalog,
  signal?: AbortSignal,
): Promise<WeeklyRecap> {
  const data = await api.get<WeeklyRecapRaw>('/recap/weekly', {
    params: { week: day(date), ...gameIdParam(c, game) },
    signal,
  })
  return { start: data.start, end: data.end, runs: data.runs.map((r) => adaptChangelog(r, game, c)) }
}

export const weeklyRecapQueryOptions = (game: string, date: Date, c: Catalog) =>
  queryOptions({
    queryKey: [...queryKeys.recap(game, day(date)), c.fromServer],
    queryFn: ({ signal }) => getWeeklyRecap(game, date, c, signal),
  })

export interface DailyChambersRaw {
  date: string
  chambers: {
    map: { steam_id: string; name: string; game_mode: string; is_coop: boolean }
    runs: ChangelogRaw[]
  }[]
}

export interface DailyChamber {
  /** The board's game_mode (as the server names it). */
  mode: string
  map: MapInfo | undefined
  runs: Run[]
}

export interface DailyChambers {
  date: string
  chambers: DailyChamber[]
}

/** The daily chambers (one map per board) for `date` (UTC) and the runs set on them that day. */
export async function getDailyChambers(
  game: string,
  date: Date,
  c: Catalog,
  signal?: AbortSignal,
): Promise<DailyChambers> {
  const data = await api.get<DailyChambersRaw>('/daily', {
    params: { date: day(date), ...gameIdParam(c, game) },
    signal,
  })
  return {
    date: data.date,
    chambers: data.chambers.map((ch) => ({
      mode: ch.map.game_mode,
      map: getMap(c, ch.map.steam_id, game) ?? findMap(c, ch.map.steam_id),
      runs: ch.runs.map((r) => adaptChangelog(r, game, c)),
    })),
  }
}

export const dailyChambersQueryOptions = (game: string, date: Date, c: Catalog) =>
  queryOptions({
    queryKey: [...queryKeys.daily(game, day(date)), c.fromServer],
    queryFn: ({ signal }) => getDailyChambers(game, date, c, signal),
  })

/** Latest runs (Portal 2 and Mel) of the followed players, newest first (legacy fetchFollowingFeed). */
export async function getFollowingFeed(profileNumbers: string[], c: Catalog, count = 8): Promise<Run[]> {
  const lists = await Promise.all(
    profileNumbers
      .slice(0, 20)
      .flatMap((profileNumber) =>
        ['portal2', 'mel'].map((game) =>
          getChangelog({ profileNumber, limit: count, game }, c).catch(() => []),
        ),
      ),
  )
  const time = (r: Run) => (r.timestamp ? Date.parse(`${r.timestamp}Z`) : 0)
  return lists
    .flat()
    .sort((a, b) => time(b) - time(a))
    .slice(0, count)
}

export const followingFeedQueryOptions = (profileNumbers: string[], c: Catalog) =>
  queryOptions({
    queryKey: [...queryKeys.followingFeed(profileNumbers), c.fromServer],
    queryFn: () => getFollowingFeed(profileNumbers, c),
  })

/** The game's runs per day, counted in the viewer's own days, oldest first. */
export async function getActivity(game: string, c: Catalog, signal?: AbortSignal): Promise<ActivityDay[]> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const rows = await api.get<{ date: string | null; count: number }[]>('/graph', {
    params: { tz, ...gameIdParam(c, game) },
    signal,
  })
  return rows
    .filter((g): g is { date: string; count: number } => Boolean(g.date))
    .map((g) => ({ date: g.date.slice(0, 10), count: g.count }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export const activityQueryOptions = (game: string, c: Catalog) =>
  queryOptions({
    queryKey: [...queryKeys.activity(game), c.fromServer],
    queryFn: ({ signal }) => getActivity(game, c, signal),
  })
