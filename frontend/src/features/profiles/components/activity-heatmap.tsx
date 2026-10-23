import { cn } from 'cn'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AppLink } from '@/components/app-link'
import { CloseIcon } from '@/components/icons'
import { Select } from '@/components/select'
import { formatDelta, formatScore } from '@/lib/format'
import type { Run } from '@/types/runs'
import {
  DAY,
  dayKey,
  heatGrid,
  level,
  runCounts,
  runsByDay as groupByDay,
  scaledLevel,
  utcDay,
  yearOptions,
  type HeatCell,
  type HeatGrid,
  type HeatRange,
} from '../utils/heatmap'

const fmt = (d: Date) =>
  d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })

const LEVELS = [
  'bg-track',
  'bg-[color-mix(in_srgb,var(--green)_30%,var(--track))]',
  'bg-[color-mix(in_srgb,var(--green)_55%,var(--track))]',
  'bg-[color-mix(in_srgb,var(--green)_78%,var(--track))]',
  'bg-green',
]
const cellClass = (l: number) => cn('size-[13px] rounded-[2px]', LEVELS[l])
const small = 'text-[11px] leading-[13px] whitespace-nowrap text-text-muted'

interface Tip {
  d: HeatCell
  /** The square, to place the card by (again when the page scrolls). */
  el: Element
  x: number
  top: number
  bottom: number
  /** Clicked: the card stays open, lists every run and links to them. */
  pinned: boolean
}

const place = (d: HeatCell, el: Element, pinned: boolean): Tip => {
  const box = el.getBoundingClientRect()
  return { d, el, x: box.left + box.width / 2, top: box.top, bottom: box.bottom, pinned }
}

/**
 * GitHub-style calendar of a player's submissions: one square per day, a column per week, shaded
 * by how many runs were set that day. The past year by default, one year, or all time (the
 * same-sized grid with each square covering several days). Hovering a square shows its runs;
 * clicking it keeps the card open, with every run linking to its own page.
 */
export function ActivityHeatmap({ history }: { history: Run[] }) {
  const counts = useMemo(() => runCounts(history), [history])
  const byDay = useMemo(() => groupByDay(history), [history])
  const { years, options } = useMemo(() => yearOptions(counts), [counts])
  const [range, setRange] = useState<HeatRange>('past')
  const [today] = useState(() => utcDay(dayKey(new Date())))
  const grid = useMemo(() => heatGrid(counts, range, today), [counts, range, today])
  const [tip, setTip] = useState<Tip | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  // Phones: start scrolled to the latest weeks. A new grid drops the card.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth
  }, [grid])
  const pick = (r: HeatRange) => {
    setRange(r)
    setTip(null)
  }

  // The card is fixed in place: a hover card goes when the page scrolls, a clicked one follows its
  // square. Either goes on a tap elsewhere, or Escape.
  useEffect(() => {
    if (!tip) return
    const scrolled = () => setTip((t) => (t?.pinned && t.el.isConnected ? place(t.d, t.el, true) : null))
    const away = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.('[data-heat-cell], [data-heat-card]')) setTip(null)
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTip(null)
    }
    window.addEventListener('scroll', scrolled, true)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('scroll', scrolled, true)
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', escape)
    }
  }, [tip])

  if (!counts.size) return null
  // Hovering only previews while nothing is clicked; clicking the open square again closes it.
  const hover = (d: HeatCell, el: Element) => setTip((t) => (t?.pinned ? t : place(d, el, false)))
  const toggle = (d: HeatCell, el: Element) =>
    setTip((t) => (t?.pinned && t.d.date.getTime() === d.date.getTime() ? null : place(d, el, true)))
  const pinnedAt = tip?.pinned ? tip.d.date.getTime() : null
  const when =
    range === 'past'
      ? 'in the past year'
      : range === 'all'
        ? `since ${years[years.length - 1]}`
        : `in ${range}`

  return (
    <div className="flex flex-col gap-2.5 px-1 pt-1">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 text-base">
        <span>
          <strong className="num text-xl">{grid.total.toLocaleString()}</strong> runs {when}
          <span className="text-text-muted">
            {' '}
            · {grid.activeDays} active days · busiest day {grid.busiestDay}
            {grid.span > 1 && ` · each square is ${grid.span} days`}
          </span>
        </span>
        <Select
          value={String(range)}
          onChange={(v) => pick(v === 'past' || v === 'all' ? v : Number(v))}
          options={[{ value: 'past', label: 'Past year' }, { value: 'all', label: 'All time' }, ...options]}
          label="Year"
          className="min-w-[140px] [&_select]:h-8!"
        />
      </div>
      <div className="overflow-x-auto [scrollbar-width:thin]" ref={scroller}>
        <div
          className="mx-auto grid w-max auto-rows-[13px] gap-[3px] p-0.5"
          style={{ gridTemplateColumns: `24px repeat(${grid.weeks.length}, 13px)` }}
          onMouseLeave={() => setTip((t) => (t?.pinned ? t : null))}
        >
          <span />
          {grid.labels.map((l, i) => (
            <span key={i} className={cn(small, 'overflow-visible')}>
              {l}
            </span>
          ))}
          {[0, 1, 2, 3, 4, 5, 6].map((row) => (
            <GridRow key={row} row={row} grid={grid} pinnedAt={pinnedAt} onHover={hover} onToggle={toggle} />
          ))}
        </div>
      </div>
      {tip && <TipCard tip={tip} span={grid.span} byDay={byDay} onClose={() => setTip(null)} />}
      <div className="flex items-center justify-end gap-1 text-xs text-text-muted">
        Less
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={cn(cellClass(l), 'inline-block')} />
        ))}
        More
      </div>
    </div>
  )
}

function GridRow({
  row,
  grid,
  pinnedAt,
  onHover,
  onToggle,
}: {
  row: number
  grid: HeatGrid
  /** The clicked square's date (ms), if any. */
  pinnedAt: number | null
  onHover: (d: HeatCell, el: Element) => void
  onToggle: (d: HeatCell, el: Element) => void
}) {
  const { weeks, span, busiest } = grid
  return (
    <>
      <span className={small}>
        {span === 1 && (row === 1 ? 'Mon' : row === 3 ? 'Wed' : row === 5 ? 'Fri' : '')}
      </span>
      {weeks.map((days, i) => {
        const d = days[row]
        if (!d?.inRange) return <span key={i} />
        const runs = `${d.n} run${d.n === 1 ? '' : 's'}`
        const label = span === 1 ? `${runs} on ${fmt(d.date)}` : `${runs}, ${fmt(d.date)} – ${fmt(d.to!)}`
        const l = span === 1 ? level(d.n) : scaledLevel(d.n, busiest)
        const pinned = pinnedAt === d.date.getTime()
        return (
          <span
            key={i}
            data-heat-cell
            role="button"
            tabIndex={0}
            aria-pressed={pinned}
            aria-label={label}
            className={cn(
              cellClass(l),
              'cursor-pointer outline-offset-1 hover:outline hover:outline-text-muted focus-visible:outline focus-visible:outline-foreground',
              pinned && 'outline-2 outline-foreground hover:outline-2 hover:outline-foreground',
            )}
            onMouseEnter={(e) => onHover(d, e.currentTarget)}
            onClick={(e) => onToggle(d, e.currentTarget)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onToggle(d, e.currentTarget)
              }
            }}
          />
        )
      })}
    </>
  )
}

const TIP_RUNS = 8
const tipRow =
  'grid grid-cols-[minmax(0,1fr)_auto_48px_34px] items-baseline gap-2 [&>span:not(:first-child)]:text-right'

function TipCells({ run }: { run: Run }) {
  return (
    <>
      <span className="truncate whitespace-nowrap">{run.map?.title ?? 'Unknown map'}</span>
      <span className="num">{formatScore(run.score)}</span>
      <span className="num text-text-muted">{run.scoreDelta != null ? formatDelta(run.scoreDelta) : ''}</span>
      <span className="num text-text-muted">{run.postRank ? `#${run.postRank}` : ''}</span>
    </>
  )
}

/**
 * Hover / tap card: the date (or range) and the runs set then, newest last. Hovering shows the
 * latest few; a clicked (pinned) card stays, lists them all and links each to its run page.
 */
function TipCard({
  tip,
  span,
  byDay,
  onClose,
}: {
  tip: Tip
  span: number
  byDay: Map<string, Run[]>
  onClose: () => void
}) {
  const { d, pinned } = tip
  const runs: Run[] = []
  for (let k = 0; k < span; k++) {
    const day = new Date(d.date.getTime() + k * DAY)
    if (d.to && day > d.to) break
    runs.push(...(byDay.get(dayKey(day)) ?? []))
  }
  const width = pinned ? 300 : 260
  const left = Math.min(Math.max(8, tip.x - width / 2), window.innerWidth - width - 8)
  const above = tip.top > window.innerHeight / 2
  const style: CSSProperties = above
    ? { left, width, bottom: window.innerHeight - tip.top + 8 }
    : { left, width, top: tip.bottom + 8 }
  const title = span === 1 ? fmt(d.date) : `${fmt(d.date)} – ${fmt(d.to!)}`
  const shown = pinned ? runs : runs.slice(-TIP_RUNS)
  return (
    <div
      data-heat-card
      role={pinned ? 'dialog' : 'tooltip'}
      aria-label={pinned ? `Runs on ${title}` : undefined}
      style={style}
      className={cn(
        'fixed z-50 flex flex-col gap-1 rounded-md border border-line bg-panel-head px-3 py-2.5 text-[13px] shadow-[0_6px_20px_rgb(0_0_0/35%)]',
        !pinned && 'pointer-events-none',
      )}
    >
      <div className="mb-0.5 flex items-center gap-2.5">
        <strong>{title}</strong>
        <span className="ml-auto text-text-muted">
          {runs.length} run{runs.length === 1 ? '' : 's'}
        </span>
        {pinned && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 inline-flex cursor-pointer rounded-[3px] border-0 bg-transparent p-0.5 text-text-muted hover:text-foreground"
          >
            <CloseIcon className="size-4" />
          </button>
        )}
      </div>
      <div
        className={cn(
          'flex flex-col gap-1',
          pinned && 'max-h-[320px] overflow-y-auto pr-1 [scrollbar-width:thin]',
        )}
      >
        {shown.map((h) =>
          pinned ? (
            <AppLink
              key={h.id}
              href={`/run/${h.id}`}
              className={cn(
                tipRow,
                '-mx-1 rounded-[3px] px-1 text-foreground no-underline hover:bg-control-raised',
              )}
            >
              <TipCells run={h} />
            </AppLink>
          ) : (
            <div key={h.id} className={tipRow}>
              <TipCells run={h} />
            </div>
          ),
        )}
      </div>
      {pinned ? (
        <div className="text-text-muted">Click a run to open it.</div>
      ) : (
        runs.length > TIP_RUNS && <div className="text-text-muted">and {runs.length - TIP_RUNS} earlier</div>
      )}
    </div>
  )
}
