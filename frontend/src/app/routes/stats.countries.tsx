import { createFileRoute } from '@tanstack/react-router'
import { NotBuiltYet } from '@/components/placeholder-page'

// Countries (5.6).
export const Route = createFileRoute('/stats/countries')({
  component: () => <NotBuiltYet title="Countries" />,
})
