import { useQuery } from '@tanstack/react-query'
import { asViewed, meQueryOptions, type CurrentUser } from '@/lib/auth'
import { useViewAsPlayer } from './use-view-as-player'

/**
 * The signed-in user as the site should treat them: null when signed out (or still loading), and
 * without a role while staff view the site as a player.
 */
export function useCurrentUser(): CurrentUser | null {
  const { data } = useQuery(meQueryOptions())
  const [asPlayer] = useViewAsPlayer()
  return asViewed(data ?? null, asPlayer)
}

/** The user and whether /auth/me has answered yet, for pages that wait for it (route guards). */
export function useCurrentUserState(): { user: CurrentUser | null; loading: boolean } {
  const { data, isPending } = useQuery(meQueryOptions())
  const [asPlayer] = useViewAsPlayer()
  return { user: asViewed(data ?? null, asPlayer), loading: isPending }
}
