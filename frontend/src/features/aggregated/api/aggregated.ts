import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { Catalog } from '@/lib/catalog'
import { queryKeys } from '@/lib/query-keys'
import type { AggregatedBoard, BoardRef, PointsChangesRaw, PointsWrapperRaw } from '../types'
import { adaptPoints, serverBoard } from '../utils/points'

/** A board's Points and Time rankings (GET /points/game/{game_id}/{board}, the server's points cache). */
export async function getAggregated(
  c: Catalog,
  ref: BoardRef,
  signal?: AbortSignal,
): Promise<AggregatedBoard> {
  const target = serverBoard(c, ref)
  if (!target) return adaptPoints(null, 0)
  const raw = await api.get<PointsWrapperRaw>(`/points/game/${target.gameId}/${target.board}`, { signal })
  return adaptPoints(raw, target.mapCount)
}

/**
 * Each player's points change on a board lately (GET /points/game/{game_id}/{board}/changes): by
 * Steam ID, unchanged players left out, with how many days back it looks.
 */
export async function getPointsChanges(
  c: Catalog,
  ref: BoardRef,
  signal?: AbortSignal,
): Promise<{ days: number; changes: Map<string, number> }> {
  const target = serverBoard(c, ref)
  if (!target) return { days: 0, changes: new Map() }
  const raw = await api.get<PointsChangesRaw>(`/points/game/${target.gameId}/${target.board}/changes`, {
    signal,
  })
  return { days: raw.days, changes: new Map(Object.entries(raw.changes)) }
}

export const pointsChangesQueryOptions = (c: Catalog, ref: BoardRef) =>
  queryOptions({
    queryKey: [...queryKeys.aggregatedChanges(ref.game, ref.board), c.fromServer],
    queryFn: ({ signal }) => getPointsChanges(c, ref, signal),
  })

export const aggregatedQueryOptions = (c: Catalog, ref: BoardRef) =>
  queryOptions({
    queryKey: [...queryKeys.aggregated(ref.game, ref.board), c.fromServer],
    queryFn: ({ signal }) => getAggregated(c, ref, signal),
  })
