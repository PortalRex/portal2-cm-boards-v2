import { createFileRoute } from '@tanstack/react-router'
import { NotBuiltYet } from '@/components/placeholder-page'

// Map list (5.2).
export const Route = createFileRoute('/maps')({
  component: () => <NotBuiltYet title="Leaderboard" />,
})
