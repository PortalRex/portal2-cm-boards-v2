import { queryOptions, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import { BUILTIN_CATALOG, buildCatalog } from './build'
import type { Catalog, CatalogRaw } from './types'

// The first page waits this long for the catalog before showing the built-in lists (as legacy).
const TIMEOUT_MS = 4000

export const getCatalog = (signal?: AbortSignal) => {
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  return api.get<CatalogRaw>('/catalog', { signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
}

export const catalogQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.catalog(),
    queryFn: ({ signal }) => getCatalog(signal),
    select: buildCatalog,
    staleTime: Infinity,
    // Like legacy: one try, then the built-in Portal 2 / Mel data for this visit.
    retry: false,
  })

/** The catalog: the server's once loaded, the built-in Portal 2 / Mel data before that or without it. */
export function useCatalog(): Catalog {
  return useQuery(catalogQueryOptions()).data ?? BUILTIN_CATALOG
}
