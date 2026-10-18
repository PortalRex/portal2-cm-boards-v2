import { createFileRoute } from '@tanstack/react-router'
import { DonatorsPage } from '@/features/donators/components/donators-page'
import { donatorsQueryOptions } from '@/features/donators/api/donators'

export const Route = createFileRoute('/more/donators')({
  loader: ({ context: { queryClient } }) => queryClient.prefetchQuery(donatorsQueryOptions()),
  component: DonatorsPage,
})
