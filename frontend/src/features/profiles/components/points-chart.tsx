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
import { useWheelZoom } from '@/hooks/use-wheel-zoom'
import { formatDate } from '@/lib/format'
import { pointsHistoryQueryOptions } from '../api/profile'
import type { PointsBoardKey, PointsPeak } from '../types'
import {
  chartRows,
  dayMs,
  domainFor,
  labelSide,
  PLOT_H,
  PLOT_TOP,
  rowsInView,
  SERIES,
  type ChartRow,
} from '../utils/points-chart'

const DAY = 24 * 3600 * 1000

/**
 * Points over time as they really were: ranks are recomputed against everyone's best times at
 * each date, so being passed shows as a drop. Scroll over it to zoom; click a day to see the
 * profile as it was then. Each board's peak is marked.
 */
export function PointsChart({
  profileNumber,
  peak,
  at,
  onPick,
}: {
  profileNumber: string
  peak: PointsPeak | null
  at: string | null
  onPick: (day: string) => void
}) {
  const [hidden, setHidden] = useState<Partial<Record<PointsBoardKey, boolean>>>({})
  const history = useQuery(pointsHistoryQueryOptions(profileNumber))
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
  const shown = SERIES.filter((s) => !hidden[s.key])
  const axisFor = (key: PointsBoardKey) => (zoomed ? key : 'shared')
  const atMs = at ? dayMs(at) : null
  const pick = (index: unknown) => {
    const d: ChartRow | undefined = data[Number(index)]
    if (d?.date) onPick(d.date.slice(0, 10))
  }

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
            onClick={(state) => pick(state?.activeTooltipIndex)}
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
                  yAxisId={axisFor(s.key)}
                  x={t}
                  y={value}
                  r={4}
                  fill={s.color}
                  stroke="var(--panel)"
                  strokeWidth={2}
                  label={{
                    value: `Peak ${value}`,
                    position: labelSide(all, data, keys, zoomed, [from, to], s.key, t, value),
                    fill: 'var(--text-2)',
                    fontSize: 11,
                  }}
                />
              )
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-start gap-x-[18px] gap-y-1 px-5 pt-2 upto800:flex-wrap upto800:justify-center upto800:gap-x-2.5 upto800:gap-y-1.5 upto800:px-0">
        <span className="mr-auto text-sm whitespace-nowrap text-text-muted uppercase upto800:mr-0 upto800:basis-full upto800:text-center">
          Points over time
        </span>
        {SERIES.map((s) => (
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
      </div>
    </div>
  )
}
