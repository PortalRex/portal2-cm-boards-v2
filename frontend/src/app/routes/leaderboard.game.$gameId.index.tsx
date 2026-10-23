import { createFileRoute, useLocation } from '@tanstack/react-router'
import { AggregatedPage } from '@/features/aggregated/components/aggregated-page'
import { gameTarget } from '@/features/aggregated/utils/pages'
import { aggregatedSearchSchema } from '@/features/aggregated/utils/search'

// A custom game without a board: its overall board (an old season address: its game's).
export const Route = createFileRoute('/leaderboard/game/$gameId/')({
  validateSearch: aggregatedSearchSchema,
  component: GameBoardsRoute,
})

function GameBoardsRoute() {
  const { gameId } = Route.useParams()
  const search = Route.useSearch()
  const searchStr = useLocation({ select: (l) => l.searchStr })
  return (
    <AggregatedPage
      resolve={(c) => gameTarget(c, gameId, undefined, search.season, searchStr)}
      search={search}
    />
  )
}
