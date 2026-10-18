import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

/** A Portal 2 personal best (GET /profile/scores/{steam id}). */
export interface ProfileScoreRaw {
  map_id: string
  score: number
  rank: number | null
  timestamp: string | null
  changelog_id: number | null
  delta_to_wr?: number | null
  delta_to_next?: number | null
}

/** A player's Portal 2 personal bests, or [] when the server can't say (legacy did the same). */
export const getProfileScores = (profileNumber: string, signal?: AbortSignal) =>
  api
    .get<ProfileScoreRaw[]>(`/profile/scores/${profileNumber}`, { signal })
    .catch(() => [] as ProfileScoreRaw[])

export const profileScoresQueryOptions = (profileNumber: string) =>
  queryOptions({
    queryKey: [...queryKeys.profile(profileNumber), 'scores'],
    queryFn: ({ signal }) => getProfileScores(profileNumber, signal),
  })
