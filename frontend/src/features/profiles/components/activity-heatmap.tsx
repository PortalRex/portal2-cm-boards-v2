import { cn } from 'cn'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
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
  x: number
  top: number
  bottom: number
}

/**
 * GitHub-style calendar of a player's submissions: one square per day, a column per week, shaded
 * by how many runs were set that day. The past year by default, one year, or all time (the
 * same-sized grid with each square covering several days).
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

  // Phones: start scrolled to the latest weeks. A new grid drops the hover card.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth
  }, [grid])
  const pick = (r: HeatRange) => {
    setRange(r)
    setTip(null)
  }

  // The card is fixed in place, so drop it when the page scrolls or on a tap elsewhere.
  useEffect(() => {
    if (!tip) return
    const hide = () => setTip(null)
    const away = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.('[data-heat-cell]')) setTip(null)
    }
    window.addEventListener('scroll', hide, true)
    document.addEventListener('pointerdown', away)
    return () => {
      window.removeEventListener('scroll', hide, true)
      document.removeEventListener('pointerdown', away)
    }
  }, [tip])

  if (!counts.size) return null
  const show = (d: HeatCell, el: Element) => {
    const box = el.getBoundingClientRect()
    setTip({ d, x: box.left + box.width / 2, top: box.top, bottom: box.bottom })
  }
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
          className="mx-auto grid w-max auto-rows-[13px] gap-[3px]"
          style={{ gridTemplateColumns: `24px repeat(${grid.weeks.length}, 13px)` }}
          onMouseLeave={() => setTip(null)}
        >
          <span />
          {grid.labels.map((l, i) => (
            <span key={i} className={cn(small, 'overflow-visible')}>
              {l}
            </span>
          ))}
          {[0, 1, 2, 3, 4, 5, 6].map((row) => (
            <GridRow key={row} row={row} grid={grid} onShow={show} />
          ))}
        </div>
      </div>
      {tip && <TipCard tip={tip} span={grid.span} byDay={byDay} />}
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
  onShow,
}: {
  row: number
  grid: HeatGrid
  onShow: (d: HeatCell, el: Element) => void
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
        return (
          <span
            key={i}
            data-heat-cell
            role="img"
            className={cn(cellClass(l), 'hover:outline hover:outline-text-muted')}
            aria-label={label}
            onMouseEnter={(e) => onShow(d, e.currentTarget)}
            onClick={(e) => onShow(d, e.currentTarget)}
          />
        )
      })}
    </>
  )
}

const TIP_RUNS = 8

/** Hover / tap card: the date (or range) and the runs set then, newest last. */
function TipCard({ tip, span, byDay }: { tip: Tip; span: number; byDay: Map<string, Run[]> }) {
  const { d } = tip
  const runs: Run[] = []
  for (let k = 0; k < span; k++) {
    const day = new Date(d.date.getTime() + k * DAY)
    if (d.to && day > d.to) break
    runs.push(...(byDay.get(dayKey(day)) ?? []))
  }
  const width = 260
  const left = Math.min(Math.max(8, tip.x - width / 2), window.innerWidth - width - 8)
  const above = tip.top > window.innerHeight / 2
  const style: CSSProperties = above
    ? { left, width, bottom: window.innerHeight - tip.top + 8 }
    : { left, width, top: tip.bottom + 8 }
  return (
    <div
      role="tooltip"
      style={style}
      className="pointer-events-none fixed z-50 flex flex-col gap-1 rounded-md border border-line bg-card-head px-3 py-2.5 text-[13px] shadow-[0_6px_20px_rgb(0_0_0/35%)]"
    >
      <div className="mb-0.5 flex justify-between gap-2.5">
        <strong>{span === 1 ? fmt(d.date) : `${fmt(d.date)} – ${fmt(d.to!)}`}</strong>
        <span className="text-text-muted">
          {runs.length} run{runs.length === 1 ? '' : 's'}
        </span>
      </div>
      {runs.slice(-TIP_RUNS).map((h) => (
        <div
          key={h.id}
          className="grid grid-cols-[minmax(0,1fr)_auto_48px_34px] items-baseline gap-2 [&>span:not(:first-child)]:text-right"
        >
          <span className="truncate whitespace-nowrap">{h.map?.title ?? 'Unknown map'}</span>
          <span className="num">{formatScore(h.score)}</span>
          <span className="num text-text-muted">{h.scoreDelta != null ? formatDelta(h.scoreDelta) : ''}</span>
          <span className="num text-text-muted">{h.postRank ? `#${h.postRank}` : ''}</span>
        </div>
      ))}
      {runs.length > TIP_RUNS && <div className="text-text-muted">and {runs.length - TIP_RUNS} earlier</div>}
    </div>
  )
}
