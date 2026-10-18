import { createFileRoute } from '@tanstack/react-router'
import { ScoreUpdatesPage } from '@/features/score-updates/components/score-updates-page'
import { scoreUpdatesSearchSchema } from '@/features/score-updates/utils/filters'

export const Route = createFileRoute('/')({
  validateSearch: scoreUpdatesSearchSchema,
  component: ScoreUpdatesRoute,
})

function ScoreUpdatesRoute() {
  const search = Route.useSearch()
  return <ScoreUpdatesPage search={search} />
}
