import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { TopBar } from '@/components/layouts/top-bar'
import { SampleDataNotice } from '@/components/sample-data-notice'
import { useTheme } from '@/hooks/use-theme'
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
  // Keeps <html data-theme> and the browser's theme colour in step with the saved theme.
  useTheme()
  return (
    <div className="relative isolate min-h-screen">
      <TopBar />
      <Outlet />
      <SampleDataNotice />
    </div>
  )
}
