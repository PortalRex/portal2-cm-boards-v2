import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import type { RouterContext } from '@/app/routes/__root'
import { routeTree } from '@/app/routeTree.gen'
import { adaptMe, type MeRaw } from '@/lib/auth'
import { queryKeys } from '@/lib/query-keys'
import { parseSearch, stringifySearch } from '@/lib/search-params'
import { STORAGE_KEYS } from '@/lib/storage'
import { users, type TestUser } from './data/users'

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  })
}

interface Options {
  /** Starting URL (path and search), "/" by default. */
  route?: string
  queryClient?: QueryClient
  /** Who is signed in: a test user, or an /auth/me answer of its own; anonymous by default. */
  user?: TestUser | MeRaw | null
  /** Staff viewing the site as a player (Settings). */
  viewAsPlayer?: boolean
}

function prepare({ queryClient, user = null, viewAsPlayer = false }: Omit<Options, 'route'>) {
  const client = queryClient ?? createTestQueryClient()
  client.setQueryData(queryKeys.me(), adaptMe(typeof user === 'string' ? users[user] : user))
  if (viewAsPlayer) localStorage.setItem(STORAGE_KEYS.viewAsPlayer, '1')
  return client
}

/**
 * Renders a component inside a fresh QueryClient and an in-memory router whose only route
 * renders `ui`, so router hooks (search params, links) work at `route`. The router has loaded
 * before it renders, so the component is on screen when this resolves.
 */
export async function renderWithProviders(ui: ReactElement, { route = '/', ...options }: Options = {}) {
  const client = prepare(options)
  const rootRoute = createRootRouteWithContext<RouterContext>()({
    component: () => (
      <>
        {ui}
        <Outlet />
      </>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute,
    context: { queryClient: client },
    history: createMemoryHistory({ initialEntries: [route] }),
    parseSearch,
    stringifySearch,
  })
  await router.load()
  const result = render(
    <QueryClientProvider client={client}>
      {/* The test router has its own tree, not the registered app one. */}
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  )
  return { ...result, router, queryClient: client }
}

/**
 * Renders the real app routes at `route`, for route-level tests (redirects, guards, loaders),
 * once the router has loaded (loaders and redirects done).
 */
export async function renderRoute(route: string, options: Omit<Options, 'route'> = {}) {
  const client = prepare(options)
  const router = createRouter({
    routeTree,
    context: { queryClient: client },
    history: createMemoryHistory({ initialEntries: [route] }),
    parseSearch,
    stringifySearch,
  })
  await router.load()
  const result = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...result, router, queryClient: client }
}
