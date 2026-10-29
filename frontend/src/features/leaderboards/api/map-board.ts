import { queryOptions } from '@tanstack/react-query'
import { adaptChangelog, adaptCoopRanked, adaptSpRanked } from '@/lib/adapters/runs'
import { api } from '@/lib/api-client'
import { gameIdParam, isMultiplayerMode, PORTAL2, type Catalog, type MapInfo } from '@/lib/catalog'
import { queryKeys } from '@/lib/query-keys'
import type { ChangelogRaw, CoopRankedRaw, OldWrRaw, RankedRun, Run, SpRankedRaw } from '@/types/runs'
import { runningBest, wrRuns } from '../utils/wr-chart'

/** A map's board, or as it stood at `at` (a UTC time "2021-04-06T12:00:00"). */
export async function getMapBoard(
  map: MapInfo,
  c: Catalog,
  at: string | null,
  signal?: AbortSignal,
): Promise<RankedRun[]> {
  const coop = isMultiplayerMode(c, map.mode)
  const params = { ...gameIdParam(c, map.game), at }
  if (coop) {
    return (await api.get<CoopRankedRaw[]>(`/map/coop/${map.id}`, { params, signal })).map(adaptCoopRanked)
  }
  return (await api.get<SpRankedRaw[]>(`/map/sp/${map.id}`, { params, signal })).map(adaptSpRanked)
}

export const mapBoardQueryOptions = (map: MapInfo, c: Catalog, at: string | null) =>
  queryOptions({
    queryKey: queryKeys.mapBoard(map.game, map.id, at),
    queryFn: ({ signal }) => getMapBoard(map, c, at, signal),
  })

export interface WrPoint {
  timestamp: string | null
  score: number
  player: string
  /** A record from before the boards' history (no run here); `timeKnown` false: only its day. */
  old?: { timeKnown: boolean; dateEstimated: boolean; note: string | null }
}

/**
 * The map's world records, oldest first (banned ones left out; a co-op run once, both partners
 * named), with Portal 2's records from
 * before the boards' history. A record counts only if it was the best yet: the boards' first
 * "records" (their best when the old boards began) can be slower than ones set before.
 */
export async function getWrHistory(map: MapInfo, c: Catalog, signal?: AbortSignal): Promise<WrPoint[]> {
  const [rows, old] = await Promise.all([
    api.get<ChangelogRaw[]>('/changelog', {
      params: { chamber: map.id, wr_gain: true, ...gameIdParam(c, map.game) },
      signal,
    }),
    // Seasons' copies of a map share its id but start afresh. Without them (say the server can't
    // send them), the chart still shows the boards' own records.
    map.game === PORTAL2
      ? api.get<OldWrRaw[]>(`/map/${map.id}/old_wrs`, { signal }).catch(() => [] as OldWrRaw[])
      : [],
  ])
  const time = (t: string | null) => (t ? Date.parse(`${t}Z`) : 0)
  const points: WrPoint[] = [
    ...old.map((o) => ({
      timestamp: o.set_at,
      score: o.score,
      player: o.player_name,
      old: { timeKnown: o.time_known, dateEstimated: o.date_estimated, note: o.note },
    })),
    ...wrRuns(rows.filter((r) => !r.banned)),
  ]
  // Undated runs can't be placed among the others (the chart leaves them out too).
  return runningBest(points.filter((p) => p.timestamp).sort((a, b) => time(a.timestamp) - time(b.timestamp)))
}

export const wrHistoryQueryOptions = (map: MapInfo, c: Catalog) =>
  queryOptions({
    queryKey: queryKeys.wrHistory(map.game, map.id),
    queryFn: ({ signal }) => getWrHistory(map, c, signal),
  })

/** Staff: every world record on the map, including runs removed from the history. */
export async function getStaffWrHistory(map: MapInfo, c: Catalog, signal?: AbortSignal): Promise<Run[]> {
  const rows = await api.get<ChangelogRaw[]>('/changelog', {
    params: { chamber: map.id, wr_gain: true, include_hidden_wr: true, ...gameIdParam(c, map.game) },
    signal,
  })
  return rows.map((r) => ({ ...adaptChangelog(r, map.game, c), wrHidden: Boolean(r.wr_hidden) }))
}

export const staffWrHistoryQueryOptions = (map: MapInfo, c: Catalog) =>
  queryOptions({
    queryKey: queryKeys.wrHistory(map.game, map.id, true),
    queryFn: ({ signal }) => getStaffWrHistory(map, c, signal),
  })
