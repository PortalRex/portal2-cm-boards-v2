import { queryOptions } from '@tanstack/react-query'
import { api, request } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import type { AuditEntry } from './audit'

/** GET /admin/inbox (server controllers/moderation.rs `inbox`). */
export interface StaffInboxData {
  /** The latest audit-log entries, newest first. */
  items: AuditEntry[]
  /** Entries after `seen_id`, not counting the viewer's own. */
  unread: number
  /** The entry the viewer has read their inbox up to. */
  seen_id: number | null
  open_reports: number
}

export const getInbox = (signal?: AbortSignal) => api.get<StaffInboxData>('/admin/inbox', { signal })

// Also loaded again every five minutes in case the live connection misses something (only while
// the page is visible).
const POLL_MS = 5 * 60 * 1000

export const inboxQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.admin.inbox(),
    queryFn: ({ signal }) => getInbox(signal),
    refetchInterval: POLL_MS,
  })

/** Marks the inbox read up to entry `id`. */
export const markInboxSeen = (id: number) => api.put('/admin/inbox/seen', { body: { id } })

/**
 * Long poll: resolves true as soon as there's an entry after `after` (or the inbox was read up to
 * somewhere other than `seen`, in another tab), false after about 25 s of nothing.
 */
export async function waitForInbox(
  after: number | null,
  seen: number | null,
  signal: AbortSignal,
): Promise<boolean> {
  const params = { after: after ?? 0, seen: seen ?? undefined }
  const { status } = await request('GET', '/admin/inbox/wait', { params, signal })
  return status === 200
}
