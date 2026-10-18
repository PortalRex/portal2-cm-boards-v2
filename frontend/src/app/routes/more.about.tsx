import { createFileRoute } from '@tanstack/react-router'
import { NotBuiltYet } from '@/components/placeholder-page'

// About (5.8).
export const Route = createFileRoute('/more/about')({
  component: () => <NotBuiltYet title="About" />,
})
