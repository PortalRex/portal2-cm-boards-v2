import { createFileRoute } from '@tanstack/react-router'
import { AggregatedPage } from '@/features/aggregated/components/aggregated-page'
import { aggregatedSearchSchema } from '@/features/aggregated/utils/search'
import { builtInTarget } from '@/features/aggregated/utils/pages'
import { PORTAL2 } from '@/lib/catalog'

// Portal 2 boards: overall / sp / coop, and "season" for the running season.
export const Route = createFileRoute('/leaderboard/$kind')({
  validateSearch: aggregatedSearchSchema,
  component: PortalBoardsRoute,
})

function PortalBoardsRoute() {
  const { kind } = Route.useParams()
  const search = Route.useSearch()
  return <AggregatedPage resolve={(c) => builtInTarget(c, PORTAL2, kind, search.season)} search={search} />
}
