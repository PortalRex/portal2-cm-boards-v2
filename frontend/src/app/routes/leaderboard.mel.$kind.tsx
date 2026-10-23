import { createFileRoute } from '@tanstack/react-router'
import { AggregatedPage } from '@/features/aggregated/components/aggregated-page'
import { builtInTarget } from '@/features/aggregated/utils/pages'
import { aggregatedSearchSchema } from '@/features/aggregated/utils/search'
import { MEL } from '@/lib/catalog'

// Mel boards: overall / story / advanced.
export const Route = createFileRoute('/leaderboard/mel/$kind')({
  validateSearch: aggregatedSearchSchema,
  component: MelBoardsRoute,
})

function MelBoardsRoute() {
  const { kind } = Route.useParams()
  const search = Route.useSearch()
  return <AggregatedPage resolve={(c) => builtInTarget(c, MEL, kind, search.season)} search={search} />
}
