import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from 'cn'
import { useRef, useState } from 'react'
import { EmptyState, Loading } from '@/components/status'
import { formatDateTime, timeAgo } from '@/lib/format'
import { invalidateRun } from '@/lib/invalidate'
import { getJobs, jobsQueryOptions, runJob, type BackgroundJob } from '../api/jobs'

// What each job's buttons do: [label, query] (the old-board pull also has a dry run).
const ACTIONS: Record<string, [label: string, query: string][]> = {
  steam_sync: [['Run now', '']],
  old_boards_sync: [
    ['Run now', ''],
    ['Dry run', 'dry_run=true'],
  ],
  demo_parse: [['Run now', 'limit=200']],
}

const triggerText = (trigger: string | null, prefix: string) =>
  trigger && trigger !== 'schedule' ? `${prefix}by ${trigger}` : `${prefix}on its schedule`

/**
 * Admins: the Steam sync, old-board pull and demo parsing, each with its schedule, its last run
 * (since the server started) and buttons to run it now. Checked every 15 s, every 3 s while
 * something runs, so a result shows up as soon as it's done.
 */
export function BackgroundJobs() {
  const qc = useQueryClient()
  // The button being run ("key:label"), and per job the error from starting it.
  const [busy, setBusy] = useState<string | null>(null)
  const [messages, setMessages] = useState<Record<string, string | null>>({})
  // A real run started here: once it has finished, the rest of the site reloads its data.
  const refreshAfter = useRef<{ key: string; since: number } | null>(null)
  const jobs = useQuery({
    ...jobsQueryOptions(),
    queryFn: async ({ signal }) => {
      const list = await getJobs(signal)
      const watched = refreshAfter.current
      const last = watched && list.find((j) => j.key === watched.key)?.last
      if (watched && last && !last.running && last.finished_at) {
        if (new Date(`${last.finished_at}Z`).getTime() >= watched.since - 2000) {
          refreshAfter.current = null
          void invalidateRun(qc, {})
        }
      }
      return list
    },
    refetchInterval: (q) => (busy || q.state.data?.some((j) => j.last?.running) ? 3000 : 15000),
  })
  const start = useMutation({
    mutationFn: ({ job, query }: { job: BackgroundJob; label: string; query: string }) =>
      runJob(job.key, query),
    onMutate: ({ job, label }) => {
      setBusy(`${job.key}:${label}`)
      setMessages((m) => ({ ...m, [job.key]: null }))
    },
    onSuccess: (_, { job, query }) => {
      if (!query.includes('dry_run')) refreshAfter.current = { key: job.key, since: Date.now() }
    },
    onError: (e, { job }) => setMessages((m) => ({ ...m, [job.key]: e.message })),
    onSettled: () => {
      setBusy(null)
      return qc.invalidateQueries({ queryKey: jobsQueryOptions().queryKey })
    },
  })

  if (jobs.isError && !jobs.data)
    return <EmptyState>Couldn’t load the background jobs: {jobs.error.message}</EmptyState>
  if (!jobs.data) return <Loading />
  return (
    <div className="flex flex-col gap-3.5">
      <p className="mt-0 mb-1 text-[15px] text-text-muted">
        These run by themselves on their schedules; run one now if you don’t want to wait. Each shows its last
        run since the server started.
      </p>
      {jobs.data.map((job) => {
        const last = job.last
        return (
          <section
            key={job.key}
            aria-label={job.name}
            className="flex flex-col gap-2.5 rounded-md bg-row px-5 py-4"
          >
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
              <h3 className="m-0 text-[19px] font-bold">{job.name}</h3>
              <span
                className={cn(
                  'rounded-[4px] bg-control-raised px-2 py-px text-[13px] font-semibold text-text-muted uppercase',
                  job.enabled && 'bg-hl-green text-foreground',
                )}
              >
                {job.enabled ? 'On' : 'Off'}
              </span>
              <span className="text-sm text-text-muted">
                {job.enabled ? job.schedule : 'Not running on a schedule'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[15px]">
              {!last ? (
                <span className="text-text-muted">Hasn’t run since the server started.</span>
              ) : last.running ? (
                <span className="text-brand-light">
                  Running… started {timeAgo(last.started_at)}
                  {triggerText(last.trigger, ' ')}
                </span>
              ) : (
                <>
                  <span
                    aria-hidden
                    className={cn('size-[9px] rounded-full', last.ok ? 'bg-[#4caf6a]' : 'bg-[#e05252]')}
                  />
                  <span title={formatDateTime(last.finished_at)}>
                    {last.dry_run ? 'Dry run ' : 'Last run '}
                    {timeAgo(last.finished_at)}
                    {triggerText(last.trigger, ' · ')}
                  </span>
                  {last.summary && (
                    <span className={cn('basis-full text-sm text-text-2', !last.ok && 'text-hl-red-text')}>
                      {last.summary}
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {(ACTIONS[job.key] ?? []).map(([label, query]) => (
                <button
                  key={label}
                  type="button"
                  className="inline-flex h-[34px] cursor-pointer items-center justify-center rounded-[4px] border border-line-strong bg-control px-4 text-lg whitespace-nowrap hover:bg-control-raised disabled:cursor-default disabled:opacity-50"
                  disabled={Boolean(busy) || Boolean(last?.running)}
                  onClick={() => start.mutate({ job, label, query })}
                >
                  {busy === `${job.key}:${label}` ? 'Running…' : label}
                </button>
              ))}
              {messages[job.key] && <span className="text-sm text-hl-red-text">{messages[job.key]}</span>}
            </div>
          </section>
        )
      })}
    </div>
  )
}
