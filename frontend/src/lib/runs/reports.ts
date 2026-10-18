import { api } from '@/lib/api-client'

/** Why a run is reported (also the labels on the staff reports page). */
export const REPORT_REASONS = [
  { value: 'cheating', label: 'Cheating or an illegitimate run' },
  { value: 'wrong_time', label: 'Wrong time' },
  { value: 'wrong_player', label: 'Wrong player or partner' },
  { value: 'bad_proof', label: "Demo or video doesn't match" },
  { value: 'other', label: 'Something else' },
] as const

export type ReportReason = (typeof REPORT_REASONS)[number]['value']

/** Reports a run anonymously (staff see the report, not who sent it). */
export const reportRun = (changelogId: number, reason: ReportReason, details: string) =>
  api.post(`/runs/${changelogId}/report`, { body: { reason, details: details || null } })
