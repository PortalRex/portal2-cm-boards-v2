import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { MapListPage } from '@/features/leaderboards/components/map-list-page'

const text = z.string().optional().catch(undefined)

export const Route = createFileRoute('/maps')({
  validateSearch: z.looseObject({ mode: text, season: text, game: text }),
  component: MapListRoute,
})

function MapListRoute() {
  return <MapListPage search={Route.useSearch()} />
}
