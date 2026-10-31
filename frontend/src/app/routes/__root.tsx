import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { PrivateGate } from '@/components/layouts/private-gate'
import { PageTimer } from '@/components/layouts/page-timer'
import { ReadOnlyBanner } from '@/components/layouts/read-only-banner'
import { LayoutSlotsContext, type LayoutSlots } from '@/components/layouts/slots'
import { PlaceholderPage } from '@/components/placeholder-page'
import { TopBar } from '@/components/layouts/top-bar'
import { SampleDataNotice } from '@/components/sample-data-notice'
import { StaffInbox } from '@/features/admin/components/staff-inbox'
import { SubmitRun } from '@/features/runs/components/submit-run'
import { useGlass } from '@/hooks/use-glass'
import { useTheme } from '@/hooks/use-theme'
import { meQueryOptions, siteQueryOptions } from '@/lib/auth'
import { catalogQueryOptions } from '@/lib/catalog'

export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  // The game and map lists come from the server; the first page waits for them (or for the
  // built-in lists when the server can't be reached), as legacy did.
  // Private mode and who is signed in decide whether the site or the sign-in gate shows.
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(catalogQueryOptions()).catch(() => null),
      queryClient.ensureQueryData(siteQueryOptions()),
      queryClient.ensureQueryData(meQueryOptions()),
    ]),
  component: RootLayout,
  // Unknown addresses get the legacy placeholder ("Page not found").
  notFoundComponent: () => <PlaceholderPage />,
})

// The top bar's feature parts (shared layout code can't import features).
const slots: LayoutSlots = {
  submitRun: (onClose) => <SubmitRun onClose={onClose} />,
  staffInbox: <StaffInbox />,
}

function RootLayout() {
  // Keeps <html data-theme> and the browser's theme colour in step with the saved theme, and
  // <html data-glass> with the glass look.
  useTheme()
  useGlass()
  return (
    <PrivateGate>
      <LayoutSlotsContext.Provider value={slots}>
        {/* On iOS the page background scrolls with the page (see Page): clip a blurred one's
            scaled-up sides so they don't widen it. */}
        <div className="relative isolate min-h-screen ios:overflow-x-clip">
          <TopBar />
          <ReadOnlyBanner />
          <Outlet />
          <PageTimer />
          <SampleDataNotice />
        </div>
      </LayoutSlotsContext.Provider>
    </PrivateGate>
  )
}
