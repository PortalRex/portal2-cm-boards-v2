import { useQuery } from '@tanstack/react-query'
import { cn } from 'cn'
import { AppLink } from '@/components/app-link'
import { BarsIcon } from '@/components/icons'
import { Card } from '@/components/panel'
import { RankNumber } from '@/components/rank'
import { EmptyState, Loading } from '@/components/status'
import { useGame } from '@/hooks/use-game'
import { ApiError } from '@/lib/api-client'
import { useCatalog } from '@/lib/catalog'
import { formatDelta, formatPoints, formatScore } from '@/lib/format'
import { aggregatedQueryOptions } from '../api/profile'
import type { StandingRaw } from '../types'
import { aggregatedLines, formatPointsGap, type AggregatedLine } from '../utils/aggregated'

// Phones: the name gets its own line, the numbers a row under it.
const grid =
  'grid grid-cols-[minmax(0,1fr)_44px_92px_72px_80px] items-center gap-x-3 px-2.5 upto700:grid-cols-[36px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] upto700:gap-x-2 upto700:px-2 upto700:py-1'
const nameCell = 'truncate upto700:col-span-4'

/**
 * The old boards' "aggregated times and points": the player's place on every chapter's, course's
 * and total board, for points and for time (where they have a time on every map), with the gap to
 * the next player up and to first. As of the profile's day when looking back. For the game picked
 * under the logo, like the tabs below it.
 */
export function AggregatedCard({ profileNumber, at }: { profileNumber: string; at: string | null }) {
  const catalog = useCatalog()
  const game = useGame()
  const gameName = catalog.games[game]?.label ?? 'Portal 2'
  const data = useQuery(aggregatedQueryOptions(catalog, profileNumber, game, at))
  const missing = data.error instanceof ApiError && data.error.status === 404
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
            value={(s) => formatPoints(s.value)}
            gap={formatPointsGap}
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

function Table({
  title,
  valueLabel,
  groups,
  pick,
  value,
  gap,
}: {
  title: string
  valueLabel: string
  groups: AggregatedLine[][]
  pick: (line: AggregatedLine) => StandingRaw | null
  value: (s: StandingRaw) => string
  gap: (g: number | null) => string
}) {
  return (
    <section role="table" aria-label={title} className="min-w-0">
      <div
        role="row"
        className={cn(grid, 'mb-1 min-h-8 border-b border-line text-sm text-text-muted uppercase')}
      >
        <span role="columnheader" className={cn(nameCell, 'text-text-2')}>
          {title}
        </span>
        <span role="columnheader" className="text-right">
          #
        </span>
        <span role="columnheader" className="text-right">
          {valueLabel}
        </span>
        <span role="columnheader" className="text-right">
          Δnext
        </span>
        <span role="columnheader" className="text-right">
          ΔWR
        </span>
      </div>
      {groups.map((lines, gi) => (
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
                <span role="cell" className="num text-right">
                  <RankNumber rank={s?.rank} colored />
                </span>
                <span role="cell" className="num text-right font-semibold">
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
