import { createFileRoute } from '@tanstack/react-router'
import { NotBuiltYet } from '@/components/placeholder-page'

// Stats: Records (5.6).
export const Route = createFileRoute('/stats/records')({
  component: () => <NotBuiltYet title="Stats" />,
})
