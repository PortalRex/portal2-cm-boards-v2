import { useQuery } from '@tanstack/react-query'
import { cn } from 'cn'
import { useMemo, useState } from 'react'
import {
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { DatePicker } from '@/components/date-picker'
import { useWheelZoom } from '@/hooks/use-wheel-zoom'
import { PORTAL2, useCatalog } from '@/lib/catalog'
import { formatDate } from '@/lib/format'
import { pointsHistoryQueryOptions } from '../api/profile'
import type { PointsBoardKey, PointsPeak } from '../types'
import type { Slot } from '../utils/summary'
import {
  chartRows,
  dayMs,
  domainFor,
  labelAlign,
  labelSide,
  PLOT_H,
  PLOT_TOP,
  rowsInView,
  SERIES,
  dayAt,
  peakClass,
  peakDayAt,
  type ChartRow,
} from '../utils/points-chart'

const DAY = 24 * 3600 * 1000

/**
 * Points over time as they really were: ranks are recomputed against everyone's best times at
 * each date, so being passed shows as a drop. Scroll over it to zoom; click a day (or pick one in
 * the date box) to see the profile as it was then. Each board's peak is marked.
 */
export function PointsChart({
  profileNumber,
  game = PORTAL2,
  slots,
  peak,
  at,
  onPick,
}: {
  profileNumber: string
  /** The game whose points it shows; its boards' names come from `slots`. */
  game?: string
  slots?: Slot[]
  peak: PointsPeak | null
  at: string | null
  onPick: (day: string) => void
}) {
  const catalog = useCatalog()
  const [hidden, setHidden] = useState<Partial<Record<PointsBoardKey, boolean>>>({})
  const history = useQuery(pointsHistoryQueryOptions(catalog, profileNumber, game))
  // The game's boards (another game's first and second in the sp and coop lines), with their names.
  const series = slots
    ? SERIES.flatMap((s) => {
        const slot = slots.find((x) => x.key === s.key)
        return slot ? [{ ...s, label: slot.label }] : []
      })
    : SERIES
  const all = useMemo(() => chartRows(history.data ?? [], peak), [history.data, peak])
  const full: [number, number] | null = all.length ? [all[0]!.t, all[all.length - 1]!.t] : null
  const [zoom, zoomRef, resetZoom] = useWheelZoom(full, { left: 10, right: 10, minSpan: 14 * DAY })

  const note = (text: string) => <div className="pt-10 pb-5 text-center text-text-muted">{text}</div>
  if (history.isPending) return note('Loading points history…')
  if (history.isError) return note('Couldn’t load the points history right now.')
  if (all.length < 2) return note('Not enough submissions for a points history yet.')

  const [from, to] = zoom ?? full!
  const data = rowsInView(all, from, to)
  const zoomed = Boolean(zoom)
  const shown = series.filter((s) => !hidden[s.key])
  const axisFor = (key: PointsBoardKey) => (zoomed ? key : 'shared')
  const atMs = at ? dayMs(at) : null

  return (
    <div className="relative mt-[18px]">
      {zoomed && (
        // Over the chart's top-right corner, so the legend keeps its one line.
        <button
          type="button"
          onClick={resetZoom}
          className="absolute -top-1.5 right-2.5 z-[1] cursor-pointer rounded-[4px] border border-line bg-panel px-2 py-px text-xs text-text-2 uppercase hover:border-line-strong hover:text-foreground"
        >
          Reset zoom
        </button>
      )}
      <div
        ref={zoomRef}
        className="cursor-pointer"
        title="Scroll to zoom · click a day to see the profile as it was then"
        data-testid="points-chart"
      >
        <ResponsiveContainer width="100%" height={PLOT_H + PLOT_TOP}>
          <LineChart
            data={data}
            margin={{ top: PLOT_TOP, right: 10, bottom: 0, left: 10 }}
            onClick={(state, e) => {
              // A peak's dot or label goes to the peak's day, anywhere else to the day under the pointer.
              const day = peakDayAt(e?.target, peak) ?? dayAt(data, state?.activeTooltipIndex)
              if (day) onPick(day)
            }}
          >
            <XAxis dataKey="t" type="number" domain={[from, to]} allowDataOverflow hide />
            {zoomed ? (
              SERIES.map((s) => (
                <YAxis
                  key={s.key}
                  yAxisId={s.key}
                  hide
                  domain={domainFor(s.key, true, data, from, to)}
                  allowDataOverflow
                />
              ))
            ) : (
              <YAxis yAxisId="shared" hide domain={[0, 'dataMax']} />
            )}
            <Tooltip
              isAnimationActive={false}
              contentStyle={{ background: 'var(--menu)', border: '1px solid var(--line)', borderRadius: 4 }}
              labelStyle={{ color: 'var(--text-2)' }}
              labelFormatter={(t, items) => {
                const d = (items?.[0]?.payload ?? undefined) as ChartRow | undefined
                return `${formatDate(d?.date ?? new Date(Number(t)).toISOString().slice(0, 10))}${d?.peakOf ? ' · peak' : ''}`
              }}
              formatter={(v, name) => [`${String(v)} pts`, name]}
            />
            {atMs != null && atMs >= from && atMs <= to && (
              <ReferenceLine
                x={atMs}
                yAxisId={zoomed ? 'overall' : 'shared'}
                stroke="var(--brand)"
                strokeDasharray="4 3"
              />
            )}
            {shown.map((s) => (
              <Line
                key={s.key}
                yAxisId={axisFor(s.key)}
                type="linear"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={3}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
            {shown.map((s) => {
              const p = peak?.[s.key]
              if (!p?.date) return null
              const t = dayMs(p.date)
              if (t < from || t > to) return null
              const value = Math.round(p.points)
              const keys = shown.map((x) => x.key)
              return (
                <ReferenceDot
                  key={`peak-${s.key}`}
                  className={peakClass(s.key)}
                  yAxisId={axisFor(s.key)}
                  x={t}
                  y={value}
                  r={4}
                  fill={s.color}
                  stroke="var(--panel)"
                  strokeWidth={2}
                  label={(props: { viewBox?: DotBox }) => (
                    <PeakLabel
                      box={props.viewBox}
                      text={`Peak ${value}`}
                      side={labelSide(all, data, keys, zoomed, [from, to], s.key, t, value)}
                      align={labelAlign(t, [from, to])}
                      className={peakClass(s.key)}
                    />
                  )}
                />
              )
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap items-center justify-start gap-x-[18px] gap-y-1.5 px-5 pt-2 upto800:justify-center upto800:gap-x-2.5 upto800:gap-y-1.5 upto800:px-0">
        <span className="mr-auto text-sm whitespace-nowrap text-text-muted uppercase upto800:mr-0 upto800:basis-full upto800:text-center">
          Points over time
        </span>
        {series.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={!hidden[s.key]}
            className={cn(
              'inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent px-1.5 py-px text-base font-light whitespace-nowrap uppercase upto800:gap-[5px] upto800:p-0 upto800:text-[15px]',
              hidden[s.key] && 'opacity-40',
            )}
            onClick={() => setHidden((h) => ({ ...h, [s.key]: !h[s.key] }))}
          >
            <span className="size-3.5 rounded-full upto800:size-[11px]" style={{ background: s.color }} />
            {s.label}
          </button>
        ))}
        <DayPicker first={all[0]!.date} at={at} onPick={onPick} />
      </div>
    </div>
  )
}

/** The profile as it was on an exact day, from the first day with points to today. */
function DayPicker({
  first,
  at,
  onPick,
}: {
  first: string
  at: string | null
  onPick: (day: string) => void
}) {
  return (
    <span className="ml-auto flex items-center gap-2 text-sm whitespace-nowrap text-text-muted uppercase upto800:ml-0">
      Profile on
      <DatePicker
        value={at}
        min={first}
        onChange={onPick}
        label="See the profile as it was on"
        placeholder="Today"
      />
    </span>
  )
}

interface DotBox {
  x: number
  y: number
  width: number
  height: number
}

/** A peak's "Peak N" over (or under) its dot, lined up so it stays inside the plot ([labelAlign]). */
function PeakLabel({
  box,
  text,
  side,
  align,
  className,
}: {
  box: DotBox | undefined
  text: string
  side: 'top' | 'bottom'
  align: 'start' | 'middle' | 'end'
  className: string
}) {
  if (!box) return null
  const cx = box.x + box.width / 2
  const x = align === 'end' ? cx + 4 : align === 'start' ? cx - 4 : cx
  const y = side === 'top' ? box.y - 5 : box.y + box.height + 12
  return (
    <text
      x={x}
      y={y}
      textAnchor={align}
      fill="var(--text-2)"
      fontSize={11}
      // An outline in the card's colour, drawn under the letters, keeps a line passing behind readable.
      stroke="var(--panel)"
      strokeWidth={3}
      strokeLinejoin="round"
      paintOrder="stroke"
      className={className}
    >
      {text}
    </text>
  )
}
