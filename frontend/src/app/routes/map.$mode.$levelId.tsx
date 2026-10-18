import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { MapPage } from '@/features/leaderboards/components/map-page'
import { RunDetails } from '@/features/runs/components/run-details'

const text = z.string().optional().catch(undefined)

export const Route = createFileRoute('/map/$mode/$levelId')({
  validateSearch: z.looseObject({ at: text, season: text }),
  component: MapRoute,
})

function MapRoute() {
  const { mode, levelId } = Route.useParams()
  const { at } = Route.useSearch()
  return (
    <MapPage
      mode={mode}
      levelId={levelId}
      at={at ?? null}
      renderRunDetails={(run, map, rendered) => (
        <RunDetails run={run} map={map} game={map.game} rendered={rendered} />
      )}
    />
  )
}
