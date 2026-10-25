import { cn } from 'cn'
import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
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

interface ChartPoint extends WrPoint {
  t: number
  gain: number | null
  carried?: boolean
  now?: boolean
}

function WrTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartPoint }[] }) {
  const p = active ? payload?.[0]?.payload : undefined
  if (!p || p.now || p.carried) return null
  return (
    <div className="flex flex-col gap-0.5 rounded-[4px] border border-line bg-menu px-2.5 py-2 text-[13px]">
      <span className="text-text-muted">{formatDate(p.t)}</span>
      <strong className="num text-base">{formatScore(p.score)}</strong>
      <span>{p.player}</span>
      {p.gain != null && <span className="num text-green">−{formatScore(p.gain)}</span>}
    </div>
  )
}

/** The map's WR history. Scroll over it to zoom; click a point to see the board as it stood then. */
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
  // What's in view: the record standing at the start, those set in view, and the one standing at
  // the end carried on to it (today, unless zoomed in).
  const before = records.filter((r) => r.t < from)
  const inRange = records.filter((r) => r.t >= from && r.t <= to)
  const standing = [...before, ...inRange]
  const data: ChartPoint[] = [
    ...(before.length ? [{ ...before[before.length - 1]!, t: from, carried: true }] : []),
    ...inRange,
    ...(standing.length
      ? [{ ...standing[standing.length - 1]!, t: to, now: to >= now, carried: to < now, gain: null }]
      : []),
  ]
  const scores = data.map((d) => d.score)
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const pad = Math.max(1, Math.round((max - min) * 0.08))
  const { ticks, label } = timeTicks(from, to)
  const atMs = at ? parseTimestamp(at).getTime() : null

  return (
    <div className={box}>
      <div className="mb-1 flex min-h-7 items-center gap-3 pr-[34px]">
        <span className="text-sm text-text-muted">
          {records.length} world record{records.length === 1 ? '' : 's'}
          {years || zoom ? ` · ${inRange.length} in view` : ''}
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
        className="cursor-pointer"
        title="Scroll to zoom · click to see the board as it stood then"
      >
        <ResponsiveContainer width="100%" height={170}>
          <AreaChart
            data={data}
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
              content={<WrTooltip />}
              cursor={{ stroke: 'var(--line-strong)' }}
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
              activeDot={{ r: 5, fill: '#c48ef0', stroke: 'var(--panel)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
