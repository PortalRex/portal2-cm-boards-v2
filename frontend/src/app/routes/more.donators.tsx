import { createFileRoute } from '@tanstack/react-router'
import { NotBuiltYet } from '@/components/placeholder-page'

// Donators (5.8).
export const Route = createFileRoute('/more/donators')({
  component: () => <NotBuiltYet title="Donators" />,
})
