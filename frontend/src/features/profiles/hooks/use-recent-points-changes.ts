import { useQuery } from '@tanstack/react-query'
import { useGame } from '@/hooks/use-game'
import { ApiError } from '@/lib/api-client'
import { useCatalog } from '@/lib/catalog'
import { aggregatedQueryOptions } from '../api/profile'
import { pointsChanges, recentFrom } from '../utils/aggregated'

/**
 * How the player's points on each board (by the aggregated boards' keys: `chapter-7`, `sp`, ...
 * `overall`) changed in the RECENT_DAYS up to the profile's day (`at`; today when null), for the
 * green and red arrows; undefined while loading. In the game picked under the logo.
 */
export function useRecentPointsChanges(
  profileNumber: string,
  at: string | null,
): Map<string, number> | undefined {
  const catalog = useCatalog()
  const game = useGame()
  const now = useQuery(aggregatedQueryOptions(catalog, profileNumber, game, at))
  // The boards as they stood RECENT_DAYS before (no runs by then: none yet).
  const before = useQuery(aggregatedQueryOptions(catalog, profileNumber, game, recentFrom(at)))
  const noneBefore = before.error instanceof ApiError && before.error.status === 404
  return now.data && (before.data || noneBefore) ? pointsChanges(now.data, before.data ?? []) : undefined
}
