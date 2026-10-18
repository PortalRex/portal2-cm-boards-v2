import { createFileRoute } from '@tanstack/react-router'
import { NotBuiltYet } from '@/components/placeholder-page'

// Profiles (5.5).
export const Route = createFileRoute('/profile/$profileId')({
  component: () => <NotBuiltYet title="Profile" />,
})
