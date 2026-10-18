import { createFileRoute, redirect } from '@tanstack/react-router'

// The Times tab was removed; its address opens Stats.
export const Route = createFileRoute('/stats/times')({
  beforeLoad: () => {
    throw redirect({ to: '/stats', replace: true })
  },
})
