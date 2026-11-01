import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { cn } from 'cn'
import { useMemo, useState } from 'react'
import { ListEnd } from '@/components/list-end'
import { PlayerLink } from '@/components/player-link'
import { RankNumber } from '@/components/rank'
import { TimeButton } from '@/components/runs/time-button'
import { SearchBox } from '@/components/search-box'
import { Select } from '@/components/select'
import { EmptyState, ErrorState, Loading } from '@/components/status'
import { useDebounced } from '@/hooks/use-debounced'
import { endlessPages, useEndlessRows } from '@/hooks/use-endless-rows'
import { useCatalog, type MapInfo } from '@/lib/catalog'
import { formatDate, formatDateTime, formatScore } from '@/lib/format'
import { BANNED_OPTIONS, RANK_OPTIONS, RUN_TOGGLES, TIME_OPTIONS, type BannedFilter } from '@/lib/run-filters'
import { changelogPagesQueryOptions } from '@/lib/runs/changelog'
import type { Run } from '@/types/runs'
import { headBase, PAGE_SIZE, rowBase } from '../utils/board-styles'

const DEFAULTS = {
  q: '',
  wr: false,
  video: false,
  demo: false,
  pending: false,
  rank: '',
  days: '',
  banned: 'hide' as BannedFilter,
}
type Filters = typeof DEFAULTS

/**
 * Every submission on the map, newest first, with the Score Updates filters (kept in the page). Rows
 * show PAGE_SIZE at a time, more as it scrolls, and older runs are fetched 200 at a time.
 */
export function ChamberHistory({ map }: { map: MapInfo }) {
  const catalog = useCatalog()
  const [f, setF] = useState<Filters>(DEFAULTS)
  const query = useDebounced(f.q, 250)
  const set = (changes: Partial<Filters>) => setF((old) => ({ ...old, ...changes }))
  const asked = {
    mapId: map.id,
    game: map.game,
    wr: f.wr,
    video: f.video,
    demo: f.demo,
    pending: f.pending,
    rank: f.rank,
    days: f.days,
    banned: f.banned,
    limit: 200,
    search: query || undefined,
  }
  const history = useInfiniteQuery({
    ...changelogPagesQueryOptions(asked, catalog),
    placeholderData: keepPreviousData,
  })
  const rows = useMemo(() => history.data?.pages.flatMap((p) => p.runs) ?? [], [history.data])
  const { visible, hasMore, end } = useEndlessRows({
    rows,
    resetKey: JSON.stringify(asked),
    step: PAGE_SIZE,
    pages: endlessPages(history),
  })
  const filtered = JSON.stringify(f) !== JSON.stringify(DEFAULTS)
  const selectClass = 'min-w-[132px] upto900:w-full upto900:min-w-0'

  return (
    <>
      <div role="group" aria-label="Filters" className="mb-3.5 flex flex-col gap-2.5">
        <SearchBox
          value={f.q}
          onChange={(v) => set({ q: v })}
          placeholder="Search players"
          showFilter={false}
        />
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 upto900:grid upto900:grid-cols-2">
          {RUN_TOGGLES.map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={f[k]}
              onClick={() => set({ [k]: !f[k] })}
              className={cn(
                'h-8 cursor-pointer rounded-2xl border border-line bg-control px-3.5 text-[15px] text-text-2 hover:border-line-strong upto900:px-2',
                f[k] && 'border-brand bg-brand text-white',
              )}
            >
              {label}
            </button>
          ))}
          <Select
            value={f.rank}
            onChange={(v) => set({ rank: v })}
            options={RANK_OPTIONS}
            label="Rank"
            size="md"
            className={selectClass}
          />
          <Select
            value={f.days}
            onChange={(v) => set({ days: v })}
            options={TIME_OPTIONS}
            label="Time"
            size="md"
            className={selectClass}
          />
          <Select
            value={f.banned}
            onChange={(v) => set({ banned: v as BannedFilter })}
            options={[...BANNED_OPTIONS]}
            label="Banned runs"
            size="md"
            className={selectClass}
          />
          {filtered && (
            <button
              type="button"
              onClick={() => set(DEFAULTS)}
              className="cursor-pointer border-0 bg-transparent text-[15px] text-brand-light hover:underline upto900:col-span-full"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="flex min-h-8 items-center justify-between gap-3">
          {/* While older runs may follow, the count so far ("200+ runs"). */}
          <span className="text-text-muted">
            {history.isPending
              ? ''
              : `${rows.length}${history.hasNextPage ? '+' : ''} run${rows.length === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>
      {history.isPending ? (
        <Loading />
      ) : history.isError ? (
        <ErrorState error={history.error} onRetry={() => void history.refetch()} />
      ) : !rows.length ? (
        <EmptyState>
          {filtered ? 'No runs match these filters.' : `No submissions recorded for ${map.title}.`}
        </EmptyState>
      ) : (
        <>
          <HistoryTable rows={visible} stale={history.isPlaceholderData} map={map} />
          {hasMore && (
            <ListEnd
              endRef={end}
              failed={history.isFetchNextPageError}
              onRetry={() => void history.fetchNextPage()}
            />
          )}
        </>
      )}
    </>
  )
}

function HistoryTable({ rows, stale, map }: { rows: Run[]; stale: boolean; map: MapInfo }) {
  const hideOnPhones = 'upto900:[&>:nth-child(3)]:hidden upto900:[&>:nth-child(5)]:hidden'
  return (
    <div
      role="table"
      aria-label="Chamber history"
      className={cn(
        '[--mp-cols:110px_minmax(0,1.6fr)_110px_90px_80px] upto900:[--mp-cols:90px_minmax(0,1fr)_76px]',
        stale && 'opacity-50',
      )}
    >
      <div role="row" className={cn(rowBase, headBase, hideOnPhones)}>
        <span role="columnheader">Date</span>
        <span role="columnheader">Player(s)</span>
        <span role="columnheader" className="text-right">
          Rank
        </span>
        <span role="columnheader" className="text-right">
          Time
        </span>
        <span role="columnheader" className="text-right">
          Δ
        </span>
      </div>
      {rows.map((e, i) => (
        <div
          key={e.id}
          role="row"
          className={cn(rowBase, hideOnPhones, i % 2 === 0 ? 'bg-row' : 'bg-row-stripe')}
        >
          <span role="cell" className="text-text-muted" title={formatDateTime(e.timestamp)}>
            {formatDate(e.timestamp)}
          </span>
          <span
            role="cell"
            className="flex min-w-0 items-center gap-1.5 self-stretch overflow-hidden whitespace-nowrap [&>*+*]:before:text-text-muted [&>*+*]:before:content-['&_']"
          >
            {e.players.map((p, j) => (
              <PlayerLink key={j} player={p} className="truncate" />
            ))}
          </span>
          <span role="cell" className="num text-right">
            <span className="inline-flex items-center gap-1.5">
              <RankNumber rank={e.preRank} colored /> → <RankNumber rank={e.postRank} colored />
            </span>
          </span>
          <span role="cell" className="num text-right">
            <TimeButton score={e.score} players={e.players} map={map} />
          </span>
          <span role="cell" className="num text-right text-text-muted">
            {e.scoreDelta != null ? formatScore(e.scoreDelta) : ''}
          </span>
        </div>
      ))}
    </div>
  )
}
