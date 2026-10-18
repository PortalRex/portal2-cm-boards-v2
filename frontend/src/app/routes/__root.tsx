import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { catalogQueryOptions } from '@/lib/catalog'

export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  // The game and map lists come from the server; the first page waits for them (or for the
  // built-in lists when the server can't be reached), as legacy did.
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQueryOptions()).catch(() => null),
  component: RootLayout,
})

function RootLayout() {
  return (
    <div className="min-h-screen">
      <Outlet />
    </div>
  )
}
