import { queryOptions } from '@tanstack/react-query'
import { player } from '@/lib/adapters/runs'
import { api } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import type { Player } from '@/types/runs'

/** A row of GET /wall_of_shame (`Users::get_banned_display`). */
export interface BannedUserRaw {
  profile_number: string
  user_name: string | null
  avatar: string | null
}

/** Players banned from the boards, sorted by name (case and accents ignored, as legacy). */
export async function getWallOfShame(signal?: AbortSignal): Promise<Player[]> {
  const rows = await api.get<BannedUserRaw[]>('/wall_of_shame', { signal })
  return rows
    .map((u) => player(u.profile_number, u.user_name, u.avatar))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

export const wallOfShameQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.wallOfShame(),
    queryFn: ({ signal }) => getWallOfShame(signal),
  })
