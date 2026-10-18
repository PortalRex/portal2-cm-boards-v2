import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from 'cn'
import { useState } from 'react'
import { PlayerLink } from '@/components/player-link'
import { EmptyState, ErrorState, Loading } from '@/components/status'
import { useCatalog, type MapInfo } from '@/lib/catalog'
import { formatDate, formatDateTime, formatScore } from '@/lib/format'
import { invalidateRun } from '@/lib/invalidate'
import type { Run } from '@/types/runs'
import { setRunWrHidden, staffWrHistoryQueryOptions } from '../api/map-board'
import { headBase, rowBase } from '../utils/board-styles'

/** Staff: every world record on the map, with removal from (and return to) the WR history. */
export function WrHistoryEditor({ map }: { map: MapInfo }) {
  const catalog = useCatalog()
  const qc = useQueryClient()
  const wrs = useQuery(staffWrHistoryQueryOptions(map, catalog))
  const [reason, setReason] = useState('')
  const toggle = useMutation({
    mutationFn: (entry: Run) => setRunWrHidden(entry.id, !entry.wrHidden, reason.trim() || undefined),
    onSuccess: (_, entry) => invalidateRun(qc, { changelogId: entry.id }),
  })

  if (wrs.isPending) return <Loading />
  if (wrs.isError) return <ErrorState error={wrs.error} onRetry={() => void wrs.refetch()} />
  const time = (r: Run) => (r.timestamp ? Date.parse(`${r.timestamp}Z`) : 0)
  const rows = [...wrs.data].sort((a, b) => time(b) - time(a))

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-center gap-x-5 gap-y-2.5">
        <p className="m-0 flex-[1_1_360px] text-[15px] text-text-muted">
          Removing a run from the WR history only takes it off the chart; the run and its place on the board
          are unchanged. Changes are recorded in the audit log.
        </p>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (audit log)"
          aria-label="Reason"
          maxLength={500}
          className="h-[34px] w-[260px] rounded-[4px] border border-line bg-control px-2.5 text-[15px] text-foreground"
        />
      </div>
      {toggle.error && <p className="text-hl-red-text">{toggle.error.message}</p>}
      {!rows.length ? (
        <EmptyState>No world records recorded for {map.title}.</EmptyState>
      ) : (
        <div
          role="table"
          aria-label="World record history"
          className="[--mp-cols:110px_minmax(0,1fr)_90px_110px]"
        >
          <div role="row" className={cn(rowBase, headBase)}>
            <span role="columnheader">Date</span>
            <span role="columnheader">Player(s)</span>
            <span role="columnheader" className="text-right">
              Time
            </span>
            <span role="columnheader" />
          </div>
          {rows.map((e, i) => (
            <div
              key={e.id}
              role="row"
              className={cn(
                rowBase,
                i % 2 === 0 ? 'bg-row' : 'bg-[rgb(var(--panel-rgb)/0.9)]',
                e.wrHidden && 'opacity-60',
              )}
            >
              <span role="cell" className="num text-text-muted" title={formatDateTime(e.timestamp)}>
                {formatDate(e.timestamp)}
              </span>
              <span role="cell" className="flex min-w-0 items-center gap-3 overflow-hidden whitespace-nowrap">
                {e.players.map((p, j) => (
                  <PlayerLink key={j} player={p} className="truncate" />
                ))}
                {e.wrHidden && <Badge>Removed from history</Badge>}
                {e.banned && <Badge>Banned</Badge>}
              </span>
              <span role="cell" className="num text-right">
                {formatScore(e.score)}
              </span>
              <span role="cell" className="text-right">
                <button
                  type="button"
                  disabled={toggle.isPending && toggle.variables?.id === e.id}
                  onClick={() => toggle.mutate(e)}
                  className={cn(
                    'h-7 cursor-pointer rounded-[4px] border bg-transparent px-3 text-sm disabled:cursor-default disabled:opacity-50',
                    e.wrHidden ? 'border-brand text-brand-light' : 'border-hl-red text-hl-red-text',
                  )}
                >
                  {e.wrHidden ? 'Restore' : 'Remove'}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Badge({ children }: { children: string }) {
  return (
    <span className="ml-2.5 rounded-[4px] bg-hl-red px-2 py-px text-[13px] whitespace-nowrap text-hl-red-text">
      {children}
    </span>
  )
}
