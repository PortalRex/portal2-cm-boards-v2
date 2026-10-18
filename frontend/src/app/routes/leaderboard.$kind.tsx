import { createFileRoute } from '@tanstack/react-router'
import { NotBuiltYet } from '@/components/placeholder-page'

// Portal 2 boards: overall / sp / coop (5.4).
export const Route = createFileRoute('/leaderboard/$kind')({
  component: () => <NotBuiltYet title="Aggregated" />,
})
