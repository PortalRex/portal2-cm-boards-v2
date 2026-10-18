import { createFileRoute } from '@tanstack/react-router'
import { NotBuiltYet } from '@/components/placeholder-page'

// Stats: Race (5.6).
export const Route = createFileRoute('/stats/race')({
  component: () => <NotBuiltYet title="Stats" />,
})
