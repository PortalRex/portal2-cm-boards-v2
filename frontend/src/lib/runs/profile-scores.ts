import { queryOptions } from '@tanstack/react-query'
import { api, type QueryParams } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

/** A personal best (GET /profile/scores/{steam id}); only Portal 2's have rank and gaps. */
export interface ProfileScoreRaw {
  map_id: string
  score: number
  rank: number | null
  timestamp: string | null
  changelog_id: number | null
  delta_to_wr?: number | null
  delta_to_next?: number | null
  /**
   * The partner on a co-op run ("N/A" when unknown). The run can be the partner's half, when the
   * player has no row of their own in it (the server's "N/A" placeholder half).
   */
  partner_profile_number?: string | null
  partner_name?: string | null
  partner_avatar?: string | null
}

/**
 * A player's personal bests in Portal 2, or in another game or season (`params`: its game_id), or []
 * when the server can't say (legacy did the same).
 */
export const getProfileScores = (profileNumber: string, signal?: AbortSignal, params?: QueryParams) =>
  api
    .get<ProfileScoreRaw[]>(`/profile/scores/${profileNumber}`, { params, signal })
    .catch(() => [] as ProfileScoreRaw[])

export const profileScoresQueryOptions = (profileNumber: string) =>
  queryOptions({
    queryKey: [...queryKeys.profile(profileNumber), 'scores'],
    queryFn: ({ signal }) => getProfileScores(profileNumber, signal),
  })
