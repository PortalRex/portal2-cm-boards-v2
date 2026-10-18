import { api } from '@/lib/api-client'

// Staff actions on a run used by more than one feature (Run Details, the WR history editor and
// the admin log's undo). Each goes to the audit log with its optional reason.

export const setRunBanned = (changelogId: number, banned: boolean, reason: string | undefined) =>
  api.put(`/admin/runs/${changelogId}/banned`, { body: { banned, reason } })

/** Removes a run from (or returns it to) its map's WR history. */
export const setRunWrHidden = (changelogId: number, hidden: boolean, reason: string | undefined) =>
  api.put(`/admin/runs/${changelogId}/wr_history`, { body: { hidden, reason } })
