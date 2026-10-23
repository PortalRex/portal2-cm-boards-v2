import { queryOptions } from '@tanstack/react-query'
import { adaptChangelog, adaptCoopRanked, adaptSpRanked } from '@/lib/adapters/runs'
import { api } from '@/lib/api-client'
import { gameIdParam, isMultiplayerMode, type Catalog, type MapInfo } from '@/lib/catalog'
import { queryKeys } from '@/lib/query-keys'
import type { ChangelogRaw, CoopRankedRaw, RankedRun, Run, SpRankedRaw } from '@/types/runs'

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
}

/** The map's world records, oldest first (banned ones left out). */
export async function getWrHistory(map: MapInfo, c: Catalog, signal?: AbortSignal): Promise<WrPoint[]> {
  const rows = await api.get<ChangelogRaw[]>('/changelog', {
    params: { chamber: map.id, wr_gain: true, ...gameIdParam(c, map.game) },
    signal,
  })
  const time = (t: string | null) => (t ? Date.parse(`${t}Z`) : 0)
  return rows
    .filter((r) => !r.banned)
    .map((r) => ({ timestamp: r.timestamp, score: r.score, player: r.user_name }))
    .sort((a, b) => time(a.timestamp) - time(b.timestamp))
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
