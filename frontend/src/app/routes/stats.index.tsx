import { createFileRoute } from '@tanstack/react-router'
import { NotBuiltYet } from '@/components/placeholder-page'

// Stats: Runners (5.6).
export const Route = createFileRoute('/stats/')({
  component: () => <NotBuiltYet title="Stats" />,
})
