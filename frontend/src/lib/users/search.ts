import { queryOptions } from '@tanstack/react-query'
import { player } from '@/lib/adapters/runs'
import { api } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import type { Player } from '@/types/runs'

/** A player found by name or Steam id, with how many runs they have. */
export interface UserHit extends Player {
  runs: number
}

/** Players by name or Steam id (GET /users/search); nothing for under two characters. */
export async function searchUsers(q: string, signal?: AbortSignal): Promise<UserHit[]> {
  if (q.trim().length < 2) return []
  const rows = await api.get<
    { profile_number: string; user_name: string | null; avatar: string | null; runs: number }[]
  >('/users/search', { params: { q: q.trim() }, signal })
  return rows.map((u) => ({ ...player(u.profile_number, u.user_name, u.avatar), runs: u.runs }))
}

export const userSearchQueryOptions = (q: string) =>
  queryOptions({ queryKey: queryKeys.userSearch(q), queryFn: ({ signal }) => searchUsers(q, signal) })
