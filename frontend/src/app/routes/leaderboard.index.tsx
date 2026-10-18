import { createFileRoute, redirect } from '@tanstack/react-router'

// Old address: the overall board.
export const Route = createFileRoute('/leaderboard/')({
  beforeLoad: () => {
    throw redirect({ to: '/leaderboard/$kind', params: { kind: 'overall' }, replace: true })
  },
})
