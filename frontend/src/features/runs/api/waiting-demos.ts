import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

/** A pending run waiting for the signed-in player's demo (`GET /user/waiting-demos`). */
export interface WaitingDemo {
  /** The run to add the demo to. */
  changelog_id: number
  map_id: string
  map_name: string
  is_coop: boolean
  score: number
  /** When it was set, to find the demo by. */
  timestamp: string | null
  partner: string | null
  partner_name: string | null
}

/**
 * Your pending runs that need your demo, newest first: your own without one, and co-op runs that
 * weren't a personal best for you but were your partner's (every co-op run needs both players'
 * demos).
 */
export const waitingDemosQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.waitingDemos(),
    queryFn: ({ signal }) => api.get<WaitingDemo[]>('/user/waiting-demos', { signal }),
  })
