import { api } from '@/lib/api-client'

// Staff actions on a run used by more than one feature (Run Details, the WR history editor, the
// admin log's undo and the switches on rows of runs). Each goes to the audit log with its optional reason.

export const setRunBanned = (changelogId: number, banned: boolean, reason: string | undefined) =>
  api.put(`/admin/runs/${changelogId}/banned`, { body: { banned, reason } })

/** Verifies a pending run, or marks it pending again. */
export const setRunVerified = (changelogId: number, verified: boolean, reason: string | undefined) =>
  api.put(`/admin/runs/${changelogId}/verified`, { body: { verified, reason } })

/** Removes a run from (or returns it to) its map's WR history. */
export const setRunWrHidden = (changelogId: number, hidden: boolean, reason: string | undefined) =>
  api.put(`/admin/runs/${changelogId}/wr_history`, { body: { hidden, reason } })
