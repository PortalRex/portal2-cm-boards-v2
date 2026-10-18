import { infiniteQueryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

/** An anonymous run report, with the run (server controllers/reports.rs ReportRow). */
export interface RunReport {
  id: number
  changelog_id: number
  reason: string
  details: string | null
  status: 'open' | 'resolved' | 'dismissed'
  /** UTC without a zone, like the other report times. */
  created_at: string
  resolved_at: string | null
  resolution_note: string | null
  resolved_by_name: string | null
  /** Open reports on the same run. */
  open_on_run: number
  map_id: string
  map_name: string
  game_id: number
  is_coop: boolean
  score: number
  post_rank: number | null
  run_banned: boolean
  run_verified: boolean | null
  has_demo: boolean
  youtube_id: string | null
  timestamp: string | null
  profile_number: string
  user_name: string
  avatar: string | null
  partner: string | null
  partner_name: string | null
}

export type ReportFilter = 'open' | 'resolved' | 'dismissed' | 'all'

export const REPORTS_PAGE = 50

export const reportsQueryOptions = (status: ReportFilter) =>
  infiniteQueryOptions({
    queryKey: queryKeys.admin.reports(status),
    queryFn: ({ pageParam, signal }) =>
      api.get<RunReport[]>('/admin/reports', { params: { status, before: pageParam }, signal }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => (last.length < REPORTS_PAGE ? undefined : last[last.length - 1]?.id),
  })

/** Resolves, dismisses or reopens a report (and, with `allOnRun`, the run's other open ones). */
export const setReportStatus = (id: number, status: RunReport['status'], note: string, allOnRun: boolean) =>
  api.put(`/admin/reports/${id}`, { body: { status, note: note || null, all_on_run: allOnRun } })
