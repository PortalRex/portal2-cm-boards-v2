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
import { Minimap } from '@/components/charts/history-minimap'
import { DatePicker } from '@/components/date-picker'
import { useWheelZoomOn } from '@/hooks/use-wheel-zoom'
import { useWidth } from '@/hooks/use-width'
import { mapsForMode, PORTAL2, useCatalog } from '@/lib/catalog'
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
  openingView,
  placeLabels,
  PLOT_H,
  PLOT_TOP,
  plotY,
  rowsInView,
  scaleOf,
  scaleRows,
  SERIES,
  dayAt,
  peakClass,
  peakDayAt,
  type BoardMax,
  type ChartRow,
  type PeakSpot,
} from '../utils/points-chart'

const DAY = 24 * 3600 * 1000
// The narrowest it zooms in to.
const MIN_SPAN = 14 * DAY

/**
 * Points over time as they really were: ranks are recomputed against everyone's best times at
 * each date, so being passed shows as a drop. Each line is drawn against its board's most points,
 * so maxed boards meet. It opens past the early climb ([openingView]); scroll over it, or use the
 * bar under it, to zoom; click a day (or pick one in the date box) to see the profile as it was
 * then. Each board's peak is marked.
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
  // The most points each board has: 200 a map (overall: its boards together).
  const max = useMemo(() => {
    const m: BoardMax = {}
    for (const s of slots ?? []) if (s.mode) m[s.key] = 200 * mapsForMode(catalog, s.mode).length
    if (m.sp != null || m.coop != null) m.overall = (m.sp ?? 0) + (m.coop ?? 0)
    return m
  }, [catalog, slots])
  const scale = scaleOf(max)
  const all = useMemo(() => scaleRows(chartRows(history.data ?? [], peak), max), [history.data, peak, max])
  const full: [number, number] | null = all.length ? [all[0]!.t, all[all.length - 1]!.t] : null
  // The bar under the chart draws the game's top line (overall, when it has one).
  const top = (series.find((s) => s.key === 'overall') ?? series[0]!).key
  const [zoom, setZoom] = useState<[number, number] | null>(null)
  // A history (the player's, or another game's) opens on its part worth seeing.
  const [openedOn, setOpenedOn] = useState<unknown>(null)
  if (history.data && history.data !== openedOn) {
    setOpenedOn(history.data)
    setZoom(
      openingView(
        all,
        series.map((s) => s.key),
      ),
    )
  }
  const zoomRef = useWheelZoomOn(full, setZoom, { left: 10, right: 10, minSpan: MIN_SPAN })
  // The chart's width, to keep the peaks' labels apart.
  const [widthRef, width] = useWidth()
  // The plot's, inside its side margins.
  const plotW = Math.max(0, width - 20)

  const note = (text: string) => <div className="pt-10 pb-5 text-center text-text-muted">{text}</div>
  if (history.isPending) return note('Loading points history…')
  if (history.isError) return note('Couldn’t load the points history right now.')
  if (all.length < 2) return note('Not enough submissions for a points history yet.')

  const [from, to] = zoom ?? full!
  const data = rowsInView(all, from, to)
  const zoomed = Boolean(zoom)
  const shown = series.filter((s) => !hidden[s.key])
  const atMs = at ? dayMs(at) : null
  // The peaks in view, overall's label first.
  const keys = shown.map((s) => s.key)
  const yPx = plotY(data, keys, zoomed, from, to)
  const peaks = [...shown].reverse().flatMap((s) => {
    const p = peak?.[s.key]
    if (!p?.date) return []
    const t = dayMs(p.date)
    if (t < from || t > to) return []
    const value = Math.round(p.points)
    // Its height on the chart (the line's scale).
    const scaled = value * scale(s.key)
    const spot: PeakSpot = {
      key: s.key,
      x: ((t - from) / Math.max(1, to - from)) * plotW,
      y: yPx(scaled),
      text: `Peak ${value}`,
      side: labelSide(all, data, keys, zoomed, [from, to], s.key, t, scaled),
      align: labelAlign(t, [from, to]),
    }
    return [{ ...spot, color: s.color, t, scaled }]
  })
  // Before the width is known, every label on its own side.
  const sides = plotW ? placeLabels(peaks) : Object.fromEntries(peaks.map((p) => [p.key, p.side]))
  const outline = all.flatMap((d) => {
    const v = d[top]
    return v != null ? [{ t: d.t, v }] : []
  })

  return (
    <div className="relative mt-[18px]">
      {zoomed && (
        // Over the chart's top-right corner, so the legend keeps its one line.
        <button
          type="button"
          onClick={() => setZoom(null)}
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
        <div ref={widthRef}>
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
              <YAxis
                hide
                domain={domainFor(
                  shown.map((s) => s.key),
                  zoomed,
                  data,
                  from,
                  to,
                )}
                allowDataOverflow={zoomed}
              />
              <Tooltip
                isAnimationActive={false}
                contentStyle={{ background: 'var(--menu)', border: '1px solid var(--line)', borderRadius: 4 }}
                labelStyle={{ color: 'var(--text-2)' }}
                labelFormatter={(t, items) => {
                  const d = (items?.[0]?.payload ?? undefined) as ChartRow | undefined
                  return `${formatDate(d?.date ?? new Date(Number(t)).toISOString().slice(0, 10))}${d?.peakOf ? ' · peak' : ''}`
                }}
                // The real points, not the line's scaled height.
                formatter={(v, name, item) => {
                  const key = item.dataKey as PointsBoardKey
                  return [`${(item.payload as ChartRow).pts?.[key] ?? String(v)} pts`, name]
                }}
              />
              {atMs != null && atMs >= from && atMs <= to && (
                <ReferenceLine x={atMs} stroke="var(--brand)" strokeDasharray="4 3" />
              )}
              {shown.map((s) => (
                <Line
                  key={s.key}
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
              {peaks.map((p) => {
                const side = sides[p.key]
                return (
                  <ReferenceDot
                    key={`peak-${p.key}`}
                    className={peakClass(p.key)}
                    x={p.t}
                    y={p.scaled}
                    r={4}
                    fill={p.color}
                    stroke="var(--panel)"
                    strokeWidth={2}
                    label={
                      side
                        ? (props: { viewBox?: DotBox }) => (
                            <PeakLabel
                              box={props.viewBox}
                              text={p.text}
                              side={side}
                              align={p.align}
                              className={peakClass(p.key)}
                            />
                          )
                        : undefined
                    }
                  />
                )
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      {/* Lined up with the plot, inside the chart's side margins. */}
      <div className="px-2.5">
        <Minimap line={outline} curve="linear" full={full!} zoom={zoom} onZoom={setZoom} minSpan={MIN_SPAN} />
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
