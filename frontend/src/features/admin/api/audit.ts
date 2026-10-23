import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

/** An entry in the audit log (server controllers/moderation.rs AdminAction). */
export interface AuditEntry {
  id: number
  admin_profile: string | null
  admin_name: string | null
  /** Done by one of the board's services (X-Service-Token), not a person. */
  via_service: boolean
  action: string
  target_type: string
  target_id: string
  reason: string | null
  /** JSON text. */
  details: string | null
  /** UTC without a zone. */
  created_at: string
  // The run acted on (run and co-op actions; deleted runs come from the saved copy).
  run_id: number | null
  map_id: string | null
  map_name: string | null
  game_id: number | null
  score: number | null
  post_rank: number | null
  player: string | null
  player_name: string | null
  partner: string | null
  partner_name: string | null
  run_exists: boolean
  /** Whether the run is hidden from the boards now (null once deleted). */
  run_banned: boolean | null
  run_wr_hidden: boolean | null
  /** The player's name, for profile actions. */
  target_name: string | null
}

/** Which part of the log: run and co-op actions, profile actions, or the game catalog. */
export type AuditKind = 'runs' | 'profiles' | 'catalog'

export const AUDIT_PAGE = 50

export const getAudit = (
  params: { kind: AuditKind; action?: string; q?: string; before?: number; limit?: number },
  signal?: AbortSignal,
) => api.get<AuditEntry[]>('/admin/audit', { params, signal })

/**
 * The log newest first, 50 at a time ("Load more" asks for the entries before the last one).
 * `search` is looked for on the server (names, maps, reasons, ids), so it covers the whole log.
 */
export const auditQueryOptions = (kind: AuditKind, action: string, search = '') =>
  infiniteQueryOptions({
    queryKey: queryKeys.admin.audit({ kind, action, search }),
    queryFn: ({ pageParam, signal }) =>
      getAudit(
        { kind, action: action || undefined, q: search || undefined, before: pageParam, limit: AUDIT_PAGE },
        signal,
      ),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => (last.length < AUDIT_PAGE ? undefined : last[last.length - 1]?.id),
  })

/** Open run reports, for the count on the Reports switch. */
export const reportCountQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.admin.reportCount(),
    queryFn: async ({ signal }) => (await api.get<{ open: number }>('/admin/reports/count', { signal })).open,
  })
