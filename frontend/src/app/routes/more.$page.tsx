import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderPage } from '@/components/placeholder-page'

// Other "More" pages: no design yet (legacy Placeholder).
export const Route = createFileRoute('/more/$page')({
  component: function MorePage() {
    const { page } = Route.useParams()
    return <PlaceholderPage page={page} />
  },
})
