import { createFileRoute } from '@tanstack/react-router'
import { NotBuiltYet } from '@/components/placeholder-page'

// A custom game's (or season's) overall board (5.4).
export const Route = createFileRoute('/leaderboard/game/$gameId/')({
  component: () => <NotBuiltYet title="Aggregated" />,
})
