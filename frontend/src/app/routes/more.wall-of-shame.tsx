import { createFileRoute } from '@tanstack/react-router'
import { NotBuiltYet } from '@/components/placeholder-page'

// Wall of Shame (5.2).
export const Route = createFileRoute('/more/wall-of-shame')({
  component: () => <NotBuiltYet title="Wall Of Shame" />,
})
