import { createFileRoute } from '@tanstack/react-router'
import { NotBuiltYet } from '@/components/placeholder-page'

// Stats: History (5.6).
export const Route = createFileRoute('/stats/history')({
  component: () => <NotBuiltYet title="Stats" />,
})
