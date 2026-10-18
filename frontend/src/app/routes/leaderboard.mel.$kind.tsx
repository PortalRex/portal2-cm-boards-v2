import { createFileRoute } from '@tanstack/react-router'
import { NotBuiltYet } from '@/components/placeholder-page'

// Mel boards: overall / story / advanced (5.4).
export const Route = createFileRoute('/leaderboard/mel/$kind')({
  component: () => <NotBuiltYet title="Aggregated" />,
})
