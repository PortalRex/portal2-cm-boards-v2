import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

/** A job's last run since the server started (server tools/jobs.rs JobRun). Times are UTC without a zone. */
export interface JobRun {
  running: boolean
  started_at: string | null
  finished_at: string | null
  /** "schedule", or the admin's name for a run started by hand. */
  trigger: string | null
  ok: boolean | null
  /** One line on what it did (or the error). */
  summary: string | null
  dry_run: boolean
}

/** GET /admin/jobs: the Steam sync, old-board pull and demo parsing. */
export interface BackgroundJob {
  /** Also the endpoint that runs it (POST /admin/{key}). */
  key: string
  name: string
  enabled: boolean
  schedule: string
  last: JobRun | null
}

export const jobsQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.admin.jobs(),
    queryFn: ({ signal }) => api.get<BackgroundJob[]>('/admin/jobs', { signal }),
  })

/** Starts a job now; the server answers straight away and the job's progress shows in the list. */
export const runJob = (key: string, query: string) =>
  api.post(`/admin/${key}?${query ? `${query}&` : ''}background=true`)
