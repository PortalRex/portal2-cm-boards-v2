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

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  })
}

interface Options {
  /** Starting URL (path and search), "/" by default. */
  route?: string
  queryClient?: QueryClient
}

/**
 * Renders a component inside a fresh QueryClient and an in-memory router whose only route
 * renders `ui`, so router hooks (search params, links) work at `route`.
 */
export function renderWithProviders(ui: ReactElement, { route = '/', queryClient }: Options = {}) {
  const client = queryClient ?? createTestQueryClient()
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
  })
  const result = render(
    <QueryClientProvider client={client}>
      {/* The test router has its own tree, not the registered app one. */}
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  )
  return { ...result, router, queryClient: client }
}

/** Renders the real app routes at `route`, for route-level tests (redirects, guards, loaders). */
export function renderRoute(route: string, { queryClient }: Omit<Options, 'route'> = {}) {
  const client = queryClient ?? createTestQueryClient()
  const router = createRouter({
    routeTree,
    context: { queryClient: client },
    history: createMemoryHistory({ initialEntries: [route] }),
  })
  const result = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...result, router, queryClient: client }
}
