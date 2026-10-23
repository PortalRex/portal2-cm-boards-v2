import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderPage } from '@/components/placeholder-page'
import { RunPage } from '@/features/runs/components/run-page'

export const Route = createFileRoute('/run/$runId')({
  component: RunRoute,
})

function RunRoute() {
  const id = Number(Route.useParams().runId)
  // Not a run id: the site's "Page not found".
  if (!Number.isSafeInteger(id) || id <= 0) return <PlaceholderPage />
  return <RunPage key={id} runId={id} />
}
