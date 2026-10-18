import { createFileRoute, useLocation } from '@tanstack/react-router'
import { AggregatedPage } from '@/features/aggregated/components/aggregated-page'
import { gameTarget } from '@/features/aggregated/utils/pages'
import { aggregatedSearchSchema } from '@/features/aggregated/utils/search'

// A custom game's board ("overall" or one of its modes); old season addresses redirect.
export const Route = createFileRoute('/leaderboard/game/$gameId/$board')({
  validateSearch: aggregatedSearchSchema,
  component: GameBoardRoute,
})

function GameBoardRoute() {
  const { gameId, board } = Route.useParams()
  const search = Route.useSearch()
  const searchStr = useLocation({ select: (l) => l.searchStr })
  return (
    <AggregatedPage resolve={(c) => gameTarget(c, gameId, board, search.season, searchStr)} search={search} />
  )
}
