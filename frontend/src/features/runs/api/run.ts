import { queryOptions } from '@tanstack/react-query'
import { adaptChangelog } from '@/lib/adapters/runs'
import { api, ApiError } from '@/lib/api-client'
import type { Catalog } from '@/lib/catalog'
import { queryKeys } from '@/lib/query-keys'
import type { ChangelogRaw, Run } from '@/types/runs'

/** One run by its changelog id (GET /changelog/{id}), from any game. */
export const getRun = async (id: number, c: Catalog, signal?: AbortSignal): Promise<Run> =>
  // The map is found in whichever game has it, so the game passed here is only a fallback.
  adaptChangelog(await api.get<ChangelogRaw>(`/changelog/${id}`, { signal }), 'portal2', c)

export const runQueryOptions = (id: number, c: Catalog) =>
  queryOptions({
    queryKey: queryKeys.run(id),
    queryFn: ({ signal }) => getRun(id, c, signal),
    // An unknown id stays unknown; anything else gets the usual one retry.
    retry: (failures, error) => !isMissingRun(error) && failures < 1,
  })

/** The server has no run with that id (404). */
export const isMissingRun = (error: unknown) => error instanceof ApiError && error.status === 404
