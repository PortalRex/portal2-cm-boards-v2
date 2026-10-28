import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { MapPage } from '@/features/leaderboards/components/map-page'
import { RunDetails } from '@/features/runs/components/run-details'
import { takeReload } from '@/lib/reload'

const text = z.string().optional().catch(undefined)

export const Route = createFileRoute('/map/$mode/$levelId')({
  validateSearch: z.looseObject({ at: text, season: text }),
  // A reload shows the live board: a moment picked on the chart doesn't stick to the page (a link
  // to one still opens it).
  beforeLoad: ({ search, location, params, preload }) => {
    if (!preload && search.at && takeReload(location.pathname))
      throw redirect({
        to: '/map/$mode/$levelId',
        params,
        search: ({ at: _at, ...rest }) => rest,
        replace: true,
      })
  },
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
