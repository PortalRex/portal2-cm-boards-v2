import { createFileRoute } from '@tanstack/react-router'
import { NotBuiltYet } from '@/components/placeholder-page'

// Map page (5.2).
export const Route = createFileRoute('/map/$mode/$levelId')({
  component: () => <NotBuiltYet title="Map" />,
})
