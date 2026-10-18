import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from 'cn'
import { useState } from 'react'
import { AppLink } from '@/components/app-link'
import { PlayerLink } from '@/components/player-link'
import { RankNumber } from '@/components/rank'
import { Segmented } from '@/components/segmented'
import { EmptyState, Loading } from '@/components/status'
import { findMap, mapPath, useCatalog } from '@/lib/catalog'
import { formatDate, formatScore, timeAgo } from '@/lib/format'
import { invalidateRun } from '@/lib/invalidate'
import { queryKeys } from '@/lib/query-keys'
import { REPORT_REASONS } from '@/lib/runs/reports'
import { reportsQueryOptions, setReportStatus, type ReportFilter, type RunReport } from '../api/reports'

const STATUSES: { value: ReportFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'all', label: 'All' },
]
const REASON_LABELS: Record<string, string> = Object.fromEntries(
  REPORT_REASONS.map((r) => [r.value, r.label]),
)
const REASON_TONES: Record<string, string> = {
  cheating: 'bg-banned text-banned-text',
  wrong_time: 'bg-pending text-pending-text',
  bad_proof: 'bg-pending text-pending-text',
}
const action =
  'h-8 cursor-pointer rounded-[4px] border border-line-strong bg-control px-3.5 text-[15px] text-foreground disabled:cursor-default disabled:opacity-50'

/** Staff: anonymous run reports. Resolve them (after acting on the run) or dismiss them. */
export function Reports() {
  const [status, setStatus] = useState<ReportFilter>('open')
  const reports = useInfiniteQuery(reportsQueryOptions(status))
  const list = reports.data?.pages.flat() ?? []
  const loading = reports.isPending || reports.isFetchingNextPage
  return (
    <div className="flex flex-col gap-3">
      <Segmented
        className="self-start"
        label="Reports"
        value={status}
        onChange={setStatus}
        options={STATUSES}
      />
      <p className="m-0 text-sm text-text-muted">
        Reports are anonymous. Open the run to hide it, mark it pending or fix its details, then resolve the
        report.
      </p>
      {reports.isError && <EmptyState>Couldn’t load reports: {reports.error.message}</EmptyState>}
      {!reports.isError && !loading && !list.length && (
        <EmptyState>{status === 'open' ? 'No open reports.' : 'No reports.'}</EmptyState>
      )}
      {list.map((r) => (
        <ReportCard key={r.id} report={r} />
      ))}
      {loading && <Loading />}
      {/* Full width: legacy's list is a flex column, so the button stretched. */}
      {!loading && reports.hasNextPage && list.length > 0 && (
        <button
          type="button"
          className="mt-4 inline-flex h-10 cursor-pointer items-center justify-center rounded-[4px] border border-line-strong bg-control px-5 text-lg whitespace-nowrap hover:bg-control-raised"
          onClick={() => void reports.fetchNextPage()}
        >
          Load more
        </button>
      )}
    </div>
  )
}

function ReportCard({ report: r }: { report: RunReport }) {
  const qc = useQueryClient()
  const catalog = useCatalog()
  const [note, setNote] = useState('')
  const [all, setAll] = useState(r.open_on_run > 1)
  const map = findMap(catalog, r.map_id)
  const act = useMutation({
    mutationFn: (status: RunReport['status']) => setReportStatus(r.id, status, note.trim(), all),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['admin', 'reports'] }),
        qc.invalidateQueries({ queryKey: queryKeys.admin.inbox() }),
        qc.invalidateQueries({ queryKey: ['admin', 'audit'] }),
        invalidateRun(qc, { changelogId: r.changelog_id, profileNumbers: [r.profile_number, r.partner] }),
      ]),
  })
  const busy = act.isPending
  const open = r.status === 'open'
  return (
    <article
      className={cn(
        'flex flex-col gap-2.5 rounded-md border border-line bg-row-alt px-4 py-3.5',
        !open && 'border-dashed',
      )}
    >
      <header className="flex flex-wrap items-center gap-2.5">
        <span
          className={cn(
            'rounded-[4px] bg-seg-active px-2.5 py-0.5 text-sm font-semibold',
            REASON_TONES[r.reason],
          )}
        >
          {REASON_LABELS[r.reason] ?? r.reason}
        </span>
        {r.open_on_run > 1 && open && (
          <span className="text-sm text-text-2">{r.open_on_run} open reports on this run</span>
        )}
        <span className="ml-auto text-sm text-text-muted" title={formatDate(`${r.created_at}Z`)}>
          {timeAgo(`${r.created_at}Z`)}
        </span>
      </header>
      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_80px_44px_minmax(0,1.4fr)] items-center gap-3 text-base max-[900px]:grid-cols-[1fr_1fr]">
        <span>
          {map ? (
            <AppLink href={mapPath(map)} className="text-brand-light">
              {r.map_name}
            </AppLink>
          ) : (
            r.map_name
          )}
        </span>
        <span>
          <PlayerLink player={{ profileNumber: r.profile_number, name: r.user_name }} />
          {r.partner && (
            <>
              <span className="text-text-muted"> & </span>
              <PlayerLink player={{ profileNumber: r.partner, name: r.partner_name || r.partner }} />
            </>
          )}
        </span>
        <span className="num text-right">{formatScore(r.score)}</span>
        <span className="text-center text-text-muted">
          <RankNumber rank={r.post_rank} />
        </span>
        <span className="flex flex-wrap items-center gap-2 text-sm">
          {r.run_banned && (
            <span className="rounded-[4px] bg-banned px-2 py-0.5 text-[13px] whitespace-nowrap text-banned-text">
              Hidden
            </span>
          )}
          {r.run_verified === false && (
            <span className="rounded-[4px] bg-pending px-3 py-1 text-[15px] tracking-[0.12em] text-pending-text uppercase">
              Pending
            </span>
          )}
          <span className="text-text-muted">{r.has_demo ? 'Demo' : 'No demo'}</span>
          {r.youtube_id && (
            <a
              href={`https://www.youtube.com/watch?v=${r.youtube_id.split('?')[0]}`}
              target="_blank"
              rel="noreferrer"
              className="text-brand-light"
            >
              Video
            </a>
          )}
        </span>
      </div>
      {r.details && (
        <p className="m-0 border-l-[3px] border-line-strong bg-row px-3 py-2 text-[15px] wrap-anywhere whitespace-pre-wrap">
          {r.details}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {open ? (
          <>
            <input
              className="h-8 min-w-[200px] flex-1 rounded-[4px] border border-line bg-control px-2.5 text-[15px] text-foreground"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (audit log)"
              aria-label="Note"
              maxLength={500}
            />
            {r.open_on_run > 1 && (
              <label className="inline-flex items-center gap-1 text-sm">
                <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> All{' '}
                {r.open_on_run} on this run
              </label>
            )}
            <button type="button" className={action} disabled={busy} onClick={() => act.mutate('dismissed')}>
              Dismiss
            </button>
            <button
              type="button"
              className={cn(action, 'border-brand bg-brand font-semibold text-white')}
              disabled={busy}
              onClick={() => act.mutate('resolved')}
            >
              Resolve
            </button>
          </>
        ) : (
          <>
            <span className="text-text-muted">
              {r.status === 'resolved' ? 'Resolved' : 'Dismissed'}
              {r.resolved_by_name ? ` by ${r.resolved_by_name}` : ''}
              {r.resolved_at ? ` ${timeAgo(`${r.resolved_at}Z`)}` : ''}
              {r.resolution_note ? ` · “${r.resolution_note}”` : ''}
            </span>
            <button type="button" className={action} disabled={busy} onClick={() => act.mutate('open')}>
              Reopen
            </button>
          </>
        )}
      </div>
      {act.error && <p className="m-0 text-sm text-hl-red-text">{act.error.message}</p>}
    </article>
  )
}
