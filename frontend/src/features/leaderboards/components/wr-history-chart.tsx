import { cn } from 'cn'
import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { TrophyFilledIcon } from '@/components/icons'
import { Loading } from '@/components/status'
import { useWheelZoom } from '@/hooks/use-wheel-zoom'
import { formatDate, formatScore, parseTimestamp } from '@/lib/format'
import type { WrPoint } from '../api/map-board'
import { timeTicks, YEAR_MS } from '../utils/time-ticks'
import { standingRecord, stepRecord, wrChartData, type ChartPoint } from '../utils/wr-chart'

const DAY_MS = 24 * 3600 * 1000

// Range buttons over the history: all of it, or the last N years (only ranges shorter than the
// history are offered).
const WR_RANGES = [
  { value: 'all', label: 'All', years: null },
  { value: '10y', label: '10Y', years: 10 },
  { value: '5y', label: '5Y', years: 5 },
  { value: '2y', label: '2Y', years: 2 },
  { value: '1y', label: '1Y', years: 1 },
] as const

/** A record's tooltip: a carried point (the line's ends) shows the record it carries. */
function WrTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartPoint }[] }) {
  const p = active ? payload?.[0]?.payload : undefined
  if (!p) return null
  return (
    <div className="flex flex-col gap-0.5 rounded-[4px] border border-line bg-menu px-2.5 py-2 text-[13px]">
      <span className="text-text-muted">
        {p.old?.dateEstimated
          ? `${formatDate(p.setAt ?? p.t).slice(0, 7)} (month only)`
          : formatDate(p.setAt ?? p.t)}
      </span>
      <strong className="num text-base">{formatScore(p.score)}</strong>
      <span>{p.player}</span>
      {p.old && (
        <span className="max-w-[220px] text-text-muted">
          Before the boards (no demo){p.old.note ? ` · ${p.old.note}` : ''}
        </span>
      )}
      {p.gain != null && <span className="num text-green">−{formatScore(p.gain)}</span>}
    </div>
  )
}

/**
 * The record the arrow keys picked, with its tooltip beside it (to the right, or left near the
 * end). Drawn by hand: the chart's own tooltip follows the mouse while it's over the chart.
 */
function PickedTooltip({
  viewBox,
  point,
  toRight,
}: {
  viewBox?: { x?: number; width?: number }
  point: ChartPoint
  toRight: boolean
}) {
  const x = (viewBox?.x ?? 0) + (viewBox?.width ?? 0) / 2
  const width = 240
  return (
    <foreignObject
      x={toRight ? x + 12 : x - 12 - width}
      y={0}
      width={width}
      height={150}
      className="pointer-events-none"
    >
      <div className={cn('flex', !toRight && 'justify-end')}>
        <WrTooltip active payload={[{ payload: point }]} />
      </div>
    </foreignObject>
  )
}

/**
 * The map's WR history. Scroll over it to zoom; click a point to see the board as it stood then,
 * and the arrow keys step to the record before or after.
 */
export function WrHistoryChart({
  points,
  loading,
  at,
  onPick,
}: {
  points: WrPoint[] | undefined
  loading: boolean
  at: string | null
  onPick: (t: number | null) => void
}) {
  // Records oldest first, each with how much it took off the previous one.
  const records = useMemo<ChartPoint[]>(() => {
    const list = (points ?? [])
      .filter((p) => p.timestamp)
      .map((p) => ({ ...p, t: parseTimestamp(p.timestamp!).getTime() }))
      .sort((a, b) => a.t - b.t)
    return list.map((p, i) => ({
      ...p,
      gain: i > 0 && list[i - 1]!.score > p.score ? list[i - 1]!.score - p.score : null,
    }))
  }, [points])
  const [range, setRange] = useState<(typeof WR_RANGES)[number]['value']>('all')
  // The arrow keys moved the moment; moving the mouse hands the tooltip back to it.
  const [keyboard, setKeyboard] = useState(false)
  // "Now" for the chart, fixed while the page is open.
  const [now] = useState(() => Date.now())
  const first = records[0]?.t ?? now
  const span = now - first
  const ranges = WR_RANGES.filter((r) => !r.years || r.years * YEAR_MS < span)
  const years = ranges.find((r) => r.value === range)?.years
  const rangeFrom = years ? now - years * YEAR_MS : first
  const [zoom, zoomRef, resetZoom] = useWheelZoom([rangeFrom, now], {
    left: 56,
    right: 12,
    minSpan: 7 * DAY_MS,
  })

  const box = 'relative mb-[26px] h-[202px]'
  if (loading && !records.length) {
    return (
      <div className={box}>
        <Loading />
      </div>
    )
  }
  if (!records.length)
    return <div className={cn(box, 'flex items-center text-text-muted')}>No world record history</div>

  const [from, to] = zoom ?? [rangeFrom, now]
  const data = wrChartData(records, from, to, now)
  const inView = records.filter((r) => r.t >= from && r.t <= to).length
  const scores = data.map((d) => d.score)
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const pad = Math.max(1, Math.round((max - min) * 0.08))
  const { ticks, label } = timeTicks(from, to)
  const atMs = at ? parseTimestamp(at).getTime() : null
  const picked = keyboard ? records[standingRecord(records, atMs)] : undefined
  const step = (dir: -1 | 1) => {
    const next = stepRecord(records, atMs, dir)
    if (next === undefined) return
    setKeyboard(true)
    onPick(next)
  }

  return (
    <div className={box}>
      <div className="mb-1 flex min-h-7 items-center gap-3 pr-[34px]">
        <span className="text-sm text-text-muted">
          {records.length} world record{records.length === 1 ? '' : 's'}
          {years || zoom ? ` · ${inView} in view` : ''}
        </span>
        {zoom && (
          <button
            type="button"
            onClick={resetZoom}
            className="cursor-pointer rounded-[4px] border border-line bg-transparent px-2 py-0.5 text-xs whitespace-nowrap text-text-2 hover:border-line-strong hover:text-foreground"
          >
            Reset zoom
          </button>
        )}
        {ranges.length > 1 && (
          <div role="group" aria-label="Range" className="ml-auto flex h-[26px] gap-1.5">
            {ranges.map((r) => (
              <button
                key={r.value}
                type="button"
                aria-pressed={range === r.value && !zoom}
                onClick={() => {
                  setRange(r.value)
                  resetZoom()
                }}
                className={cn(
                  'h-full min-w-0 cursor-pointer rounded-[4px] border-0 bg-transparent px-2.5 text-sm text-text-2 hover:bg-seg-hover upto700:flex-1',
                  range === r.value && !zoom && 'bg-seg-active font-medium text-foreground',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
        <TrophyFilledIcon className="absolute top-0 right-1.5 z-[1] size-[26px] text-trophy" />
      </div>
      <div
        ref={zoomRef}
        // Focused by a click, so the arrow keys work from there.
        tabIndex={0}
        aria-label="World record history: click a record, then use the left and right arrow keys"
        className="cursor-pointer rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-brand"
        title="Scroll to zoom · click to see the board as it stood then · arrow keys: previous / next record"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
          e.preventDefault()
          step(e.key === 'ArrowLeft' ? -1 : 1)
        }}
        onMouseMove={() => keyboard && setKeyboard(false)}
      >
        <ResponsiveContainer width="100%" height={170}>
          <AreaChart
            data={data}
            // The arrow keys are handled above (they move the board's moment too).
            accessibilityLayer={false}
            margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
            onClick={(state) => {
              const index = Number(state?.activeTooltipIndex)
              const p = Number.isInteger(index) ? data[index] : undefined
              if (p) onPick(p.now ? null : p.t)
            }}
          >
            <defs>
              <linearGradient id="wrFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#9d5fd0" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#9d5fd0" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[from, to]}
              allowDataOverflow
              ticks={ticks}
              tickFormatter={label}
              tick={{ fill: 'var(--text-2)', fontSize: 13 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[min - pad, max + pad]}
              ticks={min === max ? [min] : [min, Math.round((min + max) / 2), max]}
              allowDataOverflow
              tickFormatter={(v: number) => formatScore(v)}
              tick={{ fill: 'var(--text-muted)', fontSize: 13 }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip
              isAnimationActive={false}
              content={keyboard ? () => null : <WrTooltip />}
              cursor={keyboard ? false : { stroke: 'var(--line-strong)' }}
            />
            {atMs != null && atMs >= from && atMs <= to && (
              <ReferenceLine x={atMs} stroke="var(--brand)" strokeDasharray="4 3" />
            )}
            <Area
              type="stepAfter"
              dataKey="score"
              stroke="#b17ee0"
              strokeWidth={2}
              fill="url(#wrFill)"
              dot={false}
              activeDot={keyboard ? false : { r: 5, fill: '#c48ef0', stroke: 'var(--panel)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
            {picked && picked.t >= from && picked.t <= to && (
              <ReferenceDot
                x={picked.t}
                y={picked.score}
                r={5}
                fill="#c48ef0"
                stroke="var(--panel)"
                strokeWidth={2}
                label={<PickedTooltip point={picked} toRight={(picked.t - from) / (to - from) < 0.6} />}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
