import { createFileRoute } from '@tanstack/react-router'
import { AggregatedPage } from '@/features/aggregated/components/aggregated-page'
import { chapterTarget } from '@/features/aggregated/utils/pages'
import { aggregatedSearchSchema } from '@/features/aggregated/utils/search'

// A Portal 2 chapter's (or co-op course's) board.
export const Route = createFileRoute('/leaderboard/chapter/$chapterId')({
  validateSearch: aggregatedSearchSchema,
  component: ChapterBoardRoute,
})

function ChapterBoardRoute() {
  const { chapterId } = Route.useParams()
  return <AggregatedPage resolve={(c) => chapterTarget(c, chapterId)} search={Route.useSearch()} />
}
