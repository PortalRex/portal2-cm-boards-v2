import { queryOptions } from '@tanstack/react-query'
import { adaptPreview } from '@/lib/adapters/runs'
import { api } from '@/lib/api-client'
import { gameForMode, gameIdParam, isMultiplayerMode, mapsForMode, type Catalog } from '@/lib/catalog'
import { queryKeys } from '@/lib/query-keys'
import type { CoopPreviewRaw, PreviewRun, SpPreviewRaw } from '@/types/runs'

/** The top 7 of every map on a board, by map id (GET /coop for co-op boards, /sp otherwise). */
export async function getMapPreviews(
  board: string,
  c: Catalog,
  signal?: AbortSignal,
): Promise<Record<string, PreviewRun[]>> {
  const groups = await api.get<(SpPreviewRaw[] | CoopPreviewRaw[])[]>(
    isMultiplayerMode(c, board) ? '/coop' : '/sp',
    {
      params: gameIdParam(c, gameForMode(c, board)),
      signal,
    },
  )
  const wanted = new Set(mapsForMode(c, board).map((m) => m.id))
  const out: Record<string, PreviewRun[]> = {}
  for (const group of groups) {
    const first = group[0]
    if (first && wanted.has(String(first.map_id))) out[first.map_id] = group.slice(0, 7).map(adaptPreview)
  }
  return out
}

export const mapPreviewsQueryOptions = (board: string, c: Catalog) =>
  queryOptions({
    queryKey: [...queryKeys.mapPreviews(board), c.fromServer],
    queryFn: ({ signal }) => getMapPreviews(board, c, signal),
  })
