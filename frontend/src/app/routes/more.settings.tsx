import { createFileRoute } from '@tanstack/react-router'
import { NotBuiltYet } from '@/components/placeholder-page'

// Settings (5.7).
export const Route = createFileRoute('/more/settings')({
  component: () => <NotBuiltYet title="Settings" />,
})
