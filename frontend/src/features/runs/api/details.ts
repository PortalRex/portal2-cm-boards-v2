import { queryOptions } from '@tanstack/react-query'
import { adaptCoopHalf } from '@/lib/adapters/runs'
import { api } from '@/lib/api-client'
import { formatSegments, type FormattedSegment, type Segment } from '@/lib/autorender'
import { queryKeys } from '@/lib/query-keys'
import type { CoopHalf, CoopHalfRaw } from '@/types/runs'

/** Both players' halves of a co-op run, blue (host) first when known. */
export const getCoopHalves = async (coopId: number, signal?: AbortSignal): Promise<CoopHalf[]> =>
  (await api.get<CoopHalfRaw[]>(`/coop/${coopId}/halves`, { signal })).map(adaptCoopHalf)

export const coopHalvesQueryOptions = (coopId: number) =>
  queryOptions({
    queryKey: queryKeys.coopHalves(coopId),
    // Without them the panel shows the run as one (legacy caught the error too).
    queryFn: ({ signal }) => getCoopHalves(coopId, signal).catch(() => null),
  })

/**
 * A run's mtrigger segments, formatted for display (null when it has none). A co-op run has a
 * changelog entry per player and autorender rendered one of them, so each id is tried in turn.
 */
export async function getSegments(
  changelogIds: number[],
  mapTitle: string,
): Promise<FormattedSegment[] | null> {
  for (const id of changelogIds) {
    const segments = await api.get<Segment[]>(`/changelog/${id}/segments`).catch(() => null)
    if (segments?.length) return formatSegments(segments, mapTitle)
  }
  return null
}

export const segmentsQueryOptions = (changelogIds: number[], mapTitle: string) =>
  queryOptions({
    queryKey: [...queryKeys.runSegments(changelogIds[0] ?? -1), changelogIds],
    queryFn: () => getSegments(changelogIds, mapTitle),
    staleTime: Infinity,
  })
