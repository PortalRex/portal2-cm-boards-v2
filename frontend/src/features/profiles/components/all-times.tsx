import { cn } from 'cn'
import { useMemo, useState } from 'react'
import { AppLink } from '@/components/app-link'
import { Pagination } from '@/components/pagination'
import { RankNumber } from '@/components/rank'
import { Segmented } from '@/components/segmented'
import { Select } from '@/components/select'
import { EmptyState } from '@/components/status'
import { mapPath, useCatalog } from '@/lib/catalog'
import { formatDate, formatDelta, formatScore } from '@/lib/format'
import type { Run } from '@/types/runs'
import { filterTimes, sortTimes, TIMES_SORTS, type TimesMode, type TimesSort } from '../utils/all-times'
import { SectionTitle } from './score-tables'

const PAGE = 50
const row =
  'grid min-h-9 grid-cols-[110px_minmax(0,1fr)_90px_80px_60px] items-center gap-3 px-3 text-base upto640:grid-cols-[84px_minmax(0,1fr)_76px_44px] upto640:gap-2'
const wide = 'upto640:hidden'

/**
 * Every time the player has set in a game (or season), not just their bests: sortable, filterable by
 * single player / co-op and by map, 50 a page. Each time opens its run page.
 */
export function AllTimes({ runs }: { runs: Run[] }) {
  const catalog = useCatalog()
  const [sort, setSort] = useState<TimesSort>('newest')
  const [mode, setMode] = useState<TimesMode>('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  // Each map's place in the catalog (game, chapter, map), for "Map order".
  const mapOrder = useMemo(() => new Map([...catalog.maps.values()].map((m, i) => [m.id, i])), [catalog])
  const list = useMemo(
    () => sortTimes(filterTimes(runs, mode, query, catalog.multiplayerModes), sort, mapOrder),
    [runs, mode, query, sort, mapOrder, catalog],
  )
  const pageCount = Math.ceil(list.length / PAGE)
  const current = Math.min(page, Math.max(0, pageCount - 1))
  const shown = list.slice(current * PAGE, current * PAGE + PAGE)
  const hasCoop = runs.some((r) => catalog.multiplayerModes.has(r.map.mode))
  // A new sort or filter starts at the first page.
  const restart =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v)
      setPage(0)
    }

  return (
    <section className="flex flex-col">
      <SectionTitle>All times</SectionTitle>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <Select
          value={sort}
          onChange={(v) => restart(setSort)(v as TimesSort)}
          options={TIMES_SORTS}
          label="Sort"
          size="md"
          className="min-w-[190px]"
        />
        {hasCoop && (
          <Segmented<TimesMode>
            value={mode}
            onChange={restart(setMode)}
            label="Mode"
            size="md"
            options={[
              { value: 'all', label: 'All' },
              { value: 'sp', label: 'Single player' },
              { value: 'coop', label: 'Co-op' },
            ]}
          />
        )}
        <input
          type="search"
          value={query}
          onChange={(e) => restart(setQuery)(e.target.value)}
          placeholder="Map"
          aria-label="Filter by map"
          className="h-8 w-[180px] rounded-[4px] border border-line-strong bg-control px-2.5 text-base text-foreground"
        />
        <span className="ml-auto text-base text-text-muted">
          {list.length.toLocaleString()} {list.length === 1 ? 'time' : 'times'}
        </span>
      </div>
      {list.length === 0 ? (
        <EmptyState>{runs.length ? 'No times match.' : 'No times yet.'}</EmptyState>
      ) : (
        <>
          <div className={cn(row, 'text-[15px] font-light text-text-2 uppercase')}>
            <span>Date</span>
            <span>Map</span>
            <span className="text-right">Time</span>
            <span className={cn('text-right', wide)}>Change</span>
            <span className="text-right">Rank</span>
          </div>
          <ol className="m-0 list-none p-0">
            {shown.map((r, i) => (
              <li key={r.id} className={cn(row, i % 2 === 0 && 'bg-row')}>
                <span className="num text-text-2" title={r.dateEstimated ? 'Estimated date' : undefined}>
                  {r.timestamp ? formatDate(r.timestamp) : '–'}
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <AppLink href={mapPath(r.map)} className="truncate hover:underline">
                    {r.map.title}
                  </AppLink>
                  {r.banned ? (
                    <span className="shrink-0 rounded-[3px] bg-banned px-1.5 text-xs text-banned-text">
                      Banned
                    </span>
                  ) : (
                    !r.verified && (
                      <span className="shrink-0 rounded-[3px] bg-pending px-1.5 text-xs text-pending-text">
                        Pending
                      </span>
                    )
                  )}
                </span>
                <AppLink
                  href={`/run/${r.id}`}
                  className="num text-right font-semibold hover:underline"
                  title="Open this run"
                >
                  {formatScore(r.score)}
                </AppLink>
                <span className={cn('num text-right text-text-muted', wide)}>
                  {r.scoreDelta != null ? formatDelta(r.scoreDelta) : ''}
                </span>
                <span className="num text-right">
                  <RankNumber rank={r.postRank} colored />
                </span>
              </li>
            ))}
          </ol>
          {pageCount > 1 && (
            <div className="mt-3 flex justify-center">
              <Pagination page={current} pageCount={pageCount} onChange={setPage} />
            </div>
          )}
        </>
      )}
    </section>
  )
}
