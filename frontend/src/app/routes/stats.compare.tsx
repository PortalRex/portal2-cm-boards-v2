import { createFileRoute } from '@tanstack/react-router'
import { NotBuiltYet } from '@/components/placeholder-page'

// Compare, ?a=&b= (5.6).
export const Route = createFileRoute('/stats/compare')({
  component: () => <NotBuiltYet title="Compare" />,
})
