import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

/** GET /staff: everyone with a staff role, admins first, then moderators, then verifiers. */
export interface StaffMemberRaw {
  profile_number: string
  user_name: string
  avatar: string | null
  role: 'admin' | 'moderator' | 'verifier'
}

export const staffQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.staff(),
    queryFn: ({ signal }) => api.get<StaffMemberRaw[]>('/staff', { signal }),
  })
