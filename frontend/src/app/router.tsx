import type { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { parseSearch, stringifySearch } from '@/lib/search-params'
import { routeTree } from './routeTree.gen'

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    // Loaders read from the query cache, which keeps its own freshness.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    // Plain-text query strings (Steam ids stay exact; see lib/search-params.ts).
    parseSearch,
    stringifySearch,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
