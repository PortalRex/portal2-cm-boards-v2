import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

// Staff actions on a run (server handlers/moderation.rs). Each is written to the audit log with
// its reason, which is optional (as in legacy and on the server). Co-op runs are acted on as a
// whole (both players' entries).

type Reason = string | undefined

export { setRunBanned } from '@/lib/runs/moderation'

export const setRunVerified = (changelogId: number, verified: boolean, reason: Reason) =>
  api.put(`/admin/runs/${changelogId}/verified`, { body: { verified, reason } })

export const deleteRun = (changelogId: number, reason: Reason) =>
  api.delete(`/admin/runs/${changelogId}`, { body: { reason } })

export const removeRunDemo = (changelogId: number, reason: Reason) =>
  api.delete(`/admin/runs/${changelogId}/demo`, { body: { reason } })

export const setRunPartner = (changelogId: number, steamId: string, reason: Reason) =>
  api.put(`/admin/runs/${changelogId}/partner`, { body: { steam_id: steamId, reason } })

/** Records which co-op player hosted (played blue); null = unknown. */
export const setCoopHost = (coopId: number, host: string | null) =>
  api.put(`/coop/${coopId}/host`, { body: { host } })

/** A note only staff see; the old board's notes have no id or author. */
export interface StaffNote {
  id: number | null
  author: string | null
  author_name: string | null
  avatar: string | null
  body: string
  /** UTC without a zone. */
  created_at: string | null
}

export const staffNotesQueryOptions = (changelogId: number) =>
  queryOptions({
    queryKey: queryKeys.runStaffNotes(changelogId),
    queryFn: ({ signal }) => api.get<StaffNote[]>(`/admin/runs/${changelogId}/notes`, { signal }),
    retry: false,
  })

export const addStaffNote = (changelogId: number, body: string) =>
  api.post(`/admin/runs/${changelogId}/notes`, { body: { body } })

export const deleteStaffNote = (noteId: number) => api.delete(`/admin/runs/notes/${noteId}`)
