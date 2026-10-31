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

/** What reading a run's demo again did (server ParseReport). */
interface DemoParseReport {
  parsed: number
  failed: number
  missing_file: number
}

/**
 * Reads the run's demo again (admins): SAR version, splits, portals, players. Answers what happened
 * as a sentence; a demo that couldn't be read is an error.
 */
export async function parseRunDemo(changelogId: number): Promise<string> {
  const r = await api.post<DemoParseReport>(`/admin/runs/${changelogId}/demo/parse`)
  if (r.parsed > 0 && r.failed === 0) return 'Demo parsed again.'
  throw new Error(r.missing_file > 0 ? 'The demo file couldn’t be found.' : 'The demo couldn’t be read.')
}

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
