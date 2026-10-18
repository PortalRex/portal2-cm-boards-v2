import { createFileRoute } from '@tanstack/react-router'
import { wallOfShameQueryOptions } from '@/features/leaderboards/api/wall-of-shame'
import { WallOfShamePage } from '@/features/leaderboards/components/wall-of-shame-page'

export const Route = createFileRoute('/more/wall-of-shame')({
  loader: ({ context: { queryClient } }) => queryClient.prefetchQuery(wallOfShameQueryOptions()),
  component: WallOfShamePage,
})
