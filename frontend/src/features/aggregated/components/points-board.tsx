import { cn } from 'cn'
import { useState } from 'react'
import { Avatar, Flag } from '@/components/avatar'
import { Pagination } from '@/components/pagination'
import { PlayerLink } from '@/components/player-link'
import { EmptyState } from '@/components/status'
import { useIsMe } from '@/hooks/use-is-me'
import type { AggregatedRow } from '../types'

const PAGE_SIZE = 20

const rowClass =
  'mx-5 grid min-h-[46px] grid-cols-[46px_40px_minmax(0,1fr)_auto] items-center gap-x-2 pr-2.5 text-lg max-[860px]:mx-2 max-[600px]:min-h-10 max-[600px]:grid-cols-[34px_30px_minmax(0,1fr)_auto] max-[600px]:pr-2 max-[600px]:pl-1 max-[600px]:text-base'

/** One ranking (Points or Time), 20 players a page; `focus` opens on that player's page, marked. */
export function PointsBoard({
  title,
  rows,
  valueLabel,
  value,
  focus = null,
  empty = 'No players yet.',
}: {
  title: string
  rows: AggregatedRow[]
  valueLabel: string
  value: (row: AggregatedRow) => string
  focus?: string | null
  empty?: string
}) {
  const [page, setPage] = useState(() => {
    const at = focus ? rows.findIndex((r) => r.player.profileNumber === focus) : -1
    return at >= 0 ? Math.floor(at / PAGE_SIZE) : 0
  })
  const pageCount = Math.ceil(rows.length / PAGE_SIZE)
  const visible = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <section
      aria-label={title}
      className="min-w-0 overflow-hidden rounded-md bg-[rgb(var(--panel-rgb)/0.97)] pb-5"
    >
      <h2 className="mb-[18px] flex h-12 items-center bg-panel-head px-5 text-base font-normal tracking-[0.02em] uppercase">
        {title}
      </h2>
      <div className="mx-5 mb-[18px] flex min-h-8 justify-center max-[860px]:mx-2">
        <Pagination page={page} pageCount={pageCount} onChange={setPage} />
      </div>
      <div
        className={cn(
          rowClass,
          'min-h-[30px] text-[15px] text-text-muted uppercase max-[600px]:min-h-[30px]',
        )}
      >
        <span />
        <span className="text-center">#</span>
        <span>Player</span>
        <span className="text-right">{valueLabel}</span>
      </div>
      {visible.length ? (
        visible.map((r, i) => (
          <BoardRow
            key={r.player.profileNumber ?? i}
            row={r}
            rank={page * PAGE_SIZE + i + 1}
            value={value(r)}
            striped={i % 2 === 1}
            focused={Boolean(focus) && r.player.profileNumber === focus}
          />
        ))
      ) : (
        <EmptyState>{empty}</EmptyState>
      )}
    </section>
  )
}

function BoardRow({
  row,
  rank,
  value,
  striped,
  focused,
}: {
  row: AggregatedRow
  rank: number
  value: string
  striped: boolean
  focused: boolean
}) {
  const mine = useIsMe(row.player.profileNumber)
  return (
    <div
      className={cn(
        rowClass,
        striped && 'bg-row',
        mine && !focused && 'me-row',
        // The player a profile's rank link pointed at.
        focused &&
          'bg-[color-mix(in_srgb,var(--brand)_30%,transparent)]! shadow-[inset_3px_0_0_var(--brand-light)]',
      )}
      data-focused={focused || undefined}
    >
      <Avatar
        src={row.player.avatar}
        name={row.player.name}
        size={46}
        className="max-[600px]:size-[30px]! max-[600px]:rounded-[4px]"
      />
      <span className="num text-center">{rank}</span>
      <span className="flex min-w-0 items-center gap-2.5 overflow-hidden font-medium whitespace-nowrap">
        <Flag code={row.player.country} height={20} />
        <PlayerLink player={row.player} className="truncate" />
      </span>
      <span className="num text-right">{value}</span>
    </div>
  )
}
