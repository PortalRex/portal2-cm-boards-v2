import { useQuery, type QueryClient } from '@tanstack/react-query'
import type { RoleOverrides } from '@/lib/coop-roles'
import { queryKeys } from '@/lib/query-keys'

// Who hosted each co-op run, as just set by staff on this page (co-op id -> host profile number,
// or null for unknown). Kept in the query cache so every row showing the run updates at once.
const EMPTY: RoleOverrides = new Map()

export function useCoopRoleOverrides(): RoleOverrides {
  return (
    useQuery({
      queryKey: queryKeys.coopRoleOverrides(),
      queryFn: () => EMPTY,
      initialData: EMPTY,
      staleTime: Infinity,
      gcTime: Infinity,
    }).data ?? EMPTY
  )
}

export function setCoopRoleOverride(qc: QueryClient, coopId: number, host: string | null): void {
  qc.setQueryData<RoleOverrides>(queryKeys.coopRoleOverrides(), (old) =>
    new Map(old ?? EMPTY).set(coopId, host),
  )
}
