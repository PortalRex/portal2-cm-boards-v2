import { createFileRoute, redirect } from '@tanstack/react-router'

// Old address: Mel's overall board.
export const Route = createFileRoute('/leaderboard/mel/')({
  beforeLoad: () => {
    throw redirect({ to: '/leaderboard/mel/$kind', params: { kind: 'overall' }, replace: true })
  },
})
