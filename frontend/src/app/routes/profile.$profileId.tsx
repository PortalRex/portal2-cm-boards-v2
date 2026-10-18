import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { ProfilePage } from '@/features/profiles/components/profile-page'
import { RunDetails } from '@/features/runs/components/run-details'

const text = z.string().optional().catch(undefined)

export const Route = createFileRoute('/profile/$profileId')({
  validateSearch: z.looseObject({ at: text, season: text, game: text }),
  component: ProfileRoute,
})

function ProfileRoute() {
  const { profileId } = Route.useParams()
  const { at } = Route.useSearch()
  return (
    <ProfilePage
      // Each player gets a fresh page (tabs, zoom and forms), even going straight from one to another.
      key={profileId}
      profileId={profileId}
      at={at}
      renderRunDetails={(run, map, game, rendered) => (
        <RunDetails run={run} map={map} game={game} rendered={rendered} />
      )}
    />
  )
}
