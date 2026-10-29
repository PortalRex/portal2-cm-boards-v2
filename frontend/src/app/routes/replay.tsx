import { createFileRoute } from '@tanstack/react-router'
import { ReplayPage } from '@/features/runs/components/replay-page'
import { replaySearchSchema } from '@/lib/runs/viewer'

export const Route = createFileRoute('/replay')({
  validateSearch: replaySearchSchema,
  component: ReplayRoute,
})

function ReplayRoute() {
  return <ReplayPage search={Route.useSearch()} />
}
