import { createFileRoute } from '@tanstack/react-router'
import { NotBuiltYet } from '@/components/placeholder-page'

// A Portal 2 chapter's board (5.4).
export const Route = createFileRoute('/leaderboard/chapter/$chapterId')({
  component: () => <NotBuiltYet title="Aggregated" />,
})
