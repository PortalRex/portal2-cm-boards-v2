import { useQuery } from '@tanstack/react-query'
import { cn } from 'cn'
import { useState } from 'react'
import { AppLink } from '@/components/app-link'
import { BarsIcon, SortDownIcon, SortUpIcon } from '@/components/icons'
import { Card } from '@/components/panel'
import { PointsChange } from '@/components/points-change'
import { RankNumber } from '@/components/rank'
import { EmptyState, Loading } from '@/components/status'
import { useGame } from '@/hooks/use-game'
import { ApiError } from '@/lib/api-client'
import { useCatalog } from '@/lib/catalog'
import { formatDelta, formatPoints, formatScore } from '@/lib/format'
import { aggregatedQueryOptions } from '../api/profile'
import { useRecentPointsChanges } from '../hooks/use-recent-points-changes'
import type { StandingRaw } from '../types'
import {
  aggregatedLines,
  formatPointsGap,
  nextAggregatedSort,
  RECENT_DAYS,
  sortAggregated,
  sortsDescending,
  type AggregatedColumn,
  type AggregatedLine,
  type AggregatedSort,
} from '../utils/aggregated'

// Phones: the name gets its own line, the numbers a row under it.
const grid =
  'grid grid-cols-[minmax(0,1fr)_44px_92px_72px_80px] items-center gap-x-3 px-2.5 upto700:grid-cols-[36px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] upto700:gap-x-2 upto700:px-2 upto700:py-1'
const nameCell = 'truncate upto700:col-span-4'

/**
 * The old boards' "aggregated times and points": the player's place on every chapter's, course's
 * and total board, for points and for time (where they have a time on every map), with the gap to
 * the next player up and to first, and an arrow by the points that changed in the last 30 days.
 * As of the profile's day when looking back. For the game picked under the logo, like the tabs
 * below it.
 */
export function AggregatedCard({ profileNumber, at }: { profileNumber: string; at: string | null }) {
  const catalog = useCatalog()
  const game = useGame()
  const gameName = catalog.games[game]?.label ?? 'Portal 2'
  const data = useQuery(aggregatedQueryOptions(catalog, profileNumber, game, at))
  const missing = data.error instanceof ApiError && data.error.status === 404
  const changes = useRecentPointsChanges(profileNumber, at)
  return (
    <Card
      icon={BarsIcon}
      title="Aggregated Times and Points"
      collapseId="profile.aggregated"
      className="mb-5"
    >
      {data.isPending ? (
        <Loading label="Loading aggregated times and points" />
      ) : missing ? (
        <EmptyState>{at ? `No ${gameName} times by then.` : `No ${gameName} times yet.`}</EmptyState>
      ) : data.isError ? (
        <EmptyState>Couldn’t load the aggregated times and points.</EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 px-1 pt-1 pb-2 upto1320:grid-cols-1">
          <Table
            title="Points"
            valueLabel="Points"
            groups={aggregatedLines(catalog, game, data.data, profileNumber)}
            pick={(line) => line.row?.points ?? null}
            morePointsFirst
            value={(s) => formatPoints(s.value)}
            gap={formatPointsGap}
            change={(line) => changes?.get(line.key)}
          />
          <Table
            title="Times"
            valueLabel="Time"
            groups={aggregatedLines(catalog, game, data.data, profileNumber)}
            pick={(line) => line.row?.time ?? null}
            value={(s) => formatScore(s.value)}
            gap={(g) => (g == null ? '–' : formatDelta(g))}
          />
        </div>
      )}
    </Card>
  )
}

/** A column's header: a button that sorts the table by it (see `nextAggregatedSort`). */
function SortHeader({
  column,
  label,
  name = label,
  center = false,
  sort,
  onSort,
  morePointsFirst,
}: {
  column: AggregatedColumn
  label: string
  /** What the button says to screen readers, when the label is a sign. */
  name?: string
  /** Centred over its column (the places) rather than right-aligned. */
  center?: boolean
  sort: AggregatedSort | null
  onSort: (sort: AggregatedSort | null) => void
  morePointsFirst: boolean
}) {
  const on = sort?.column === column ? sort : null
  const descending = on && sortsDescending(on, morePointsFirst)
  const Arrow = descending ? SortDownIcon : SortUpIcon
  return (
    <span
      role="columnheader"
      className={center ? 'text-center' : 'text-right'}
      aria-sort={on ? (descending ? 'descending' : 'ascending') : 'none'}
    >
      <button
        type="button"
        className={cn(
          'inline-flex cursor-pointer items-center gap-0.5 border-0 bg-transparent p-0 text-inherit uppercase hover:text-foreground',
          on && 'text-foreground',
        )}
        onClick={() => onSort(nextAggregatedSort(column, sort))}
        aria-label={`Sort by ${name}`}
      >
        {on && <Arrow className="size-3.5" />}
        {label}
      </button>
    </span>
  )
}

function Table({
  title,
  valueLabel,
  groups,
  pick,
  morePointsFirst = false,
  value,
  gap,
  change,
}: {
  title: string
  valueLabel: string
  groups: AggregatedLine[][]
  pick: (line: AggregatedLine) => StandingRaw | null
  /** Points: the most is best (a time's best is the least). */
  morePointsFirst?: boolean
  value: (s: StandingRaw) => string
  gap: (g: number | null) => string
  /** The line's points change lately, shown as an arrow by its value. */
  change?: (line: AggregatedLine) => number | undefined
}) {
  const [sort, setSort] = useState<AggregatedSort | null>(null)
  const header = { sort, onSort: setSort, morePointsFirst }
  return (
    <section role="table" aria-label={title} className="min-w-0">
      <div
        role="row"
        className={cn(grid, 'mb-1 min-h-8 border-b border-line text-sm text-text-muted uppercase')}
      >
        <span role="columnheader" className={cn(nameCell, 'text-text-2')}>
          {title}
        </span>
        <SortHeader column="rank" label="#" name="place" center {...header} />
        <SortHeader column="value" label={valueLabel} {...header} />
        <SortHeader column="next" label="Δnext" {...header} />
        <SortHeader column="wr" label="ΔWR" {...header} />
      </div>
      {sortAggregated(groups, pick, sort, morePointsFirst).map((lines, gi) => (
        <div key={gi} role="rowgroup" className={cn(gi > 0 && 'mt-2.5 border-t border-line/60 pt-2.5')}>
          {lines.map((line, i) => {
            const s = pick(line)
            return (
              <div
                key={line.key}
                role="row"
                className={cn(grid, 'min-h-[30px] text-base', i % 2 === 0 && 'bg-row')}
              >
                <span role="rowheader" className={nameCell}>
                  {line.href ? (
                    <AppLink href={line.href} className="hover:underline">
                      {line.label}
                    </AppLink>
                  ) : (
                    line.label
                  )}
                </span>
                {/* The rank colours, 25% more vivid here (as the Global Rank card's). Centred, so a
                    WR's trophy (wider than a digit) lines up with the places under it. */}
                <span role="cell" className="num text-center saturate-125">
                  <RankNumber rank={s?.rank} colored />
                </span>
                <span role="cell" className="num text-right font-semibold">
                  <PointsChange change={change?.(line)} days={RECENT_DAYS} />
                  {s ? value(s) : '–'}
                </span>
                <span role="cell" className="num text-right text-text-muted">
                  {s ? gap(s.next) : '–'}
                </span>
                <span role="cell" className="num text-right text-text-muted">
                  {s ? gap(s.wr) : '–'}
                </span>
              </div>
            )
          })}
        </div>
      ))}
    </section>
  )
}
