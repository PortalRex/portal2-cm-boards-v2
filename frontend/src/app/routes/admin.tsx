import { createFileRoute } from '@tanstack/react-router'
import { NotBuiltYet } from '@/components/placeholder-page'

// Staff panel, staff only (5.9).
export const Route = createFileRoute('/admin')({
  component: () => <NotBuiltYet title="Staff" />,
})
