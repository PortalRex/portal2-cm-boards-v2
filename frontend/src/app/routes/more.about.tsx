import { createFileRoute } from '@tanstack/react-router'
import { staffQueryOptions } from '@/features/about/api/staff'
import { AboutPage } from '@/features/about/components/about-page'

export const Route = createFileRoute('/more/about')({
  loader: ({ context: { queryClient } }) => queryClient.prefetchQuery(staffQueryOptions()),
  component: AboutPage,
})
