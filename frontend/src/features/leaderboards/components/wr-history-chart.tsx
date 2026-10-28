import { cn } from 'cn'
import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
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
import { ExpandIcon, TrophyFilledIcon } from '@/components/icons'
import { Loading } from '@/components/status'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { panDomain, revealDomain, useWheelZoomOn } from '@/hooks/use-wheel-zoom'
import { formatDate, formatScore, parseTimestamp } from '@/lib/format'
import type { WrPoint } from '../api/map-board'
import { timeTicks } from '../utils/time-ticks'
import {
  playerColors,
  scoreTicks,
  standingRecord,
  stepRecord,
  wrChartData,
  type ChartPoint,
} from '../utils/wr-chart'
import { WrMinimap } from './wr-minimap'

type Domain = [number, number]

const DAY_MS = 24 * 3600 * 1000
const MIN_SPAN = 7 * DAY_MS
// The plot's margins: the time axis' labels on the left, a little room on the right.
const AXIS_WIDTH = 56
const RIGHT = 12
// How far the pointer moves before a press becomes a drag (and not a click).
const DRAG_PX = 4

const pad2 = (n: number) => String(n).padStart(2, '0')

/** When a record was set, as exactly as it's known: day and time, the day, or the month. */
function setWhen(p: ChartPoint): string {
  const t = p.setAt ?? p.t
  if (p.old?.dateEstimated) return `${formatDate(t).slice(0, 7)} (month only)`
  if (p.old && !p.old.timeKnown) return formatDate(t)
  const d = new Date(t)
  return `${formatDate(t)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** A record's tooltip: when, who (in their colour), the time and how much it took off. */
function WrTooltip({ point: p, color }: { point: ChartPoint; color: string }) {
  return (
    <div className="flex min-w-36 flex-col gap-1 rounded-md border border-line bg-menu px-2.5 py-1.5 text-xs shadow-[0_8px_24px_rgb(0_0_0/45%)]">
      <span className="font-medium">{setWhen(p)}</span>
      <div className="flex items-center justify-between gap-4">
        <span className="flex min-w-0 items-center gap-1.5 text-text-2">
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="min-w-0 [overflow-wrap:anywhere]">{p.player}</span>
        </span>
        <span className="num shrink-0 font-medium">
          {formatScore(p.score)}
          {p.gain != null && <span className="text-text-muted"> (−{formatScore(p.gain)})</span>}
        </span>
      </div>
      {p.old && (
        <span className="max-w-[240px] text-text-muted">
          Before the boards (no demo){p.old.note ? ` · ${p.old.note}` : ''}
        </span>
      )}
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
  color,
  toRight,
}: {
  viewBox?: { x?: number; width?: number }
  point: ChartPoint
  color: string
  toRight: boolean
}) {
  const x = (viewBox?.x ?? 0) + (viewBox?.width ?? 0) / 2
  const width = 260
  return (
    <foreignObject
      x={toRight ? x + 12 : x - 12 - width}
      y={0}
      width={width}
      height={120}
      className="pointer-events-none"
    >
      <div className={cn('flex', !toRight && 'justify-end')}>
        <WrTooltip point={point} color={color} />
      </div>
    </foreignObject>
  )
}

interface PlotProps {
  records: ChartPoint[]
  colorOf: (player: string) => string
  full: Domain
  zoom: Domain | null
  setZoom: Dispatch<SetStateAction<Domain | null>>
  now: number
  atMs: number | null
  keyboard: boolean
  setKeyboard: (on: boolean) => void
  onPick: (t: number | null) => void
  /** After a click picked a moment (not the arrow keys). */
  onClicked?: () => void
  height: number | string
}

/**
 * The chart: a step line of the record standing at each moment, a dot (in its holder's colour) for
 * each record. Scroll to zoom, drag to move along; click to see the board as it stood then, and the
 * arrow keys step to the record before or after.
 */
function WrPlot({
  records,
  colorOf,
  full,
  zoom,
  setZoom,
  now,
  atMs,
  keyboard,
  setKeyboard,
  onPick,
  onClicked,
  height,
}: PlotProps) {
  const wheelRef = useWheelZoomOn(full, setZoom, { left: AXIS_WIDTH, right: RIGHT, minSpan: MIN_SPAN })
  const drag = useRef<{ x: number; view: Domain | null; moved: boolean } | null>(null)
  const [dragging, setDragging] = useState(false)

  const [from, to] = zoom ?? full
  const data = wrChartData(records, from, to, now)
  const scores = data.map((d) => d.score)
  const yTicks = scoreTicks(Math.min(...scores), Math.max(...scores))
  const { ticks, label } = timeTicks(from, to)
  const picked = keyboard ? records[standingRecord(records, atMs)] : undefined
  const step = (dir: -1 | 1) => {
    const next = stepRecord(records, atMs, dir)
    if (next === undefined) return
    setKeyboard(true)
    onPick(next)
    // Stepping off the zoomed view moves it along to the record (or today).
    setZoom((d) => revealDomain(d, full, next ?? now))
  }

  return (
    <div
      ref={wheelRef}
      data-wr-plot
      // Focused by a click, so the arrow keys work from there.
      tabIndex={0}
      aria-label="World record history: click a record, then use the left and right arrow keys"
      className={cn(
        'touch-pan-y rounded-[4px] outline-none select-none focus-visible:ring-2 focus-visible:ring-brand',
        dragging ? 'cursor-grabbing' : 'cursor-pointer',
      )}
      style={{ height }}
      title="Scroll to zoom · drag to move · click to see the board as it stood then · arrow keys: previous / next record"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        step(e.key === 'ArrowLeft' ? -1 : 1)
      }}
      onPointerDown={(e) => {
        if (e.button === 0) drag.current = { x: e.clientX, view: zoom, moved: false }
      }}
      onPointerMove={(e) => {
        if (keyboard) setKeyboard(false)
        const d = drag.current
        if (!d) return
        const dx = e.clientX - d.x
        if (!d.moved) {
          if (Math.abs(dx) < DRAG_PX) return
          d.moved = true
          setDragging(true)
          e.currentTarget.setPointerCapture(e.pointerId)
        }
        const [a, b] = d.view ?? full
        const plot = e.currentTarget.getBoundingClientRect().width - AXIS_WIDTH - RIGHT
        setZoom(panDomain(d.view, full, (-dx / Math.max(1, plot)) * (b - a)))
      }}
      onPointerUp={() => {
        setDragging(false)
        // Still flagged as moved until the click that ends the drag has been ignored.
        if (!drag.current?.moved) drag.current = null
      }}
      onClickCapture={(e) => {
        if (drag.current?.moved) e.stopPropagation()
        drag.current = null
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          // The arrow keys are handled above (they move the board's moment too).
          accessibilityLayer={false}
          margin={{ top: 8, right: RIGHT, bottom: 0, left: 0 }}
          onClick={(state) => {
            const index = Number(state?.activeTooltipIndex)
            const p = Number.isInteger(index) ? data[index] : undefined
            if (!p) return
            onPick(p.now ? null : p.t)
            onClicked?.()
          }}
        >
          <defs>
            <linearGradient id="wrFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--wr-line)" stopOpacity={0.32} />
              <stop offset="95%" stopColor="var(--wr-line)" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={[from, to]}
            ticks={ticks}
            tickFormatter={label}
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[yTicks[0]!, yTicks[yTicks.length - 1]!]}
            ticks={yTicks}
            interval={0}
            tickFormatter={(v: number) => formatScore(v)}
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={AXIS_WIDTH}
          />
          <Tooltip
            isAnimationActive={false}
            content={({ active, payload }) => {
              const p = active && !keyboard ? (payload?.[0]?.payload as ChartPoint | undefined) : undefined
              return p ? <WrTooltip point={p} color={colorOf(p.player)} /> : null
            }}
            cursor={keyboard ? false : { stroke: 'var(--line-strong)', strokeOpacity: 0.6 }}
          />
          {atMs != null && atMs >= from && atMs <= to && (
            <ReferenceLine x={atMs} stroke="var(--brand)" strokeDasharray="4 3" />
          )}
          <Area
            type="stepAfter"
            dataKey="score"
            stroke="var(--wr-line)"
            strokeWidth={1.5}
            fill="url(#wrFill)"
            dot={({
              cx,
              cy,
              payload,
              index,
            }: {
              cx?: number
              cy?: number
              payload?: ChartPoint
              index?: number
            }) => {
              // Copies carrying a record along its line get no dot: only the records do.
              if (!payload || payload.carried || payload.now || cx == null || cy == null)
                return <g key={index} />
              const color = colorOf(payload.player)
              return (
                <circle
                  key={index}
                  cx={cx}
                  cy={cy}
                  r={3.5}
                  // Records from before the boards (no demo) are hollow.
                  fill={payload.old ? 'var(--panel)' : color}
                  fillOpacity={payload.old ? 1 : 0.85}
                  stroke={payload.old ? color : 'none'}
                  strokeWidth={1.5}
                />
              )
            }}
            activeDot={
              keyboard
                ? false
                : ({ cx, cy, payload }: { cx?: number; cy?: number; payload?: ChartPoint }) => (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={6}
                      fill={payload ? colorOf(payload.player) : 'var(--wr-line)'}
                      stroke="var(--panel)"
                      strokeWidth={2}
                    />
                  )
            }
            isAnimationActive={false}
          />
          {picked && picked.t >= from && picked.t <= to && (
            <ReferenceDot
              x={picked.t}
              y={picked.score}
              r={6}
              fill={colorOf(picked.player)}
              stroke="var(--panel)"
              strokeWidth={2}
              label={
                <PickedTooltip
                  point={picked}
                  color={colorOf(picked.player)}
                  toRight={(picked.t - from) / (to - from) < 0.6}
                />
              }
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * The map's WR history, with the whole of it in small underneath to zoom and move with, and a
 * bigger view in a dialog.
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
  const colorOf = useMemo(() => playerColors(records), [records])
  const [zoom, setZoom] = useState<Domain | null>(null)
  const [expanded, setExpanded] = useState(false)
  // A click on the big chart closed it: the arrow keys carry on from the small one.
  const pickedInDialog = useRef(false)
  const boxRef = useRef<HTMLDivElement>(null)
  // The arrow keys moved the moment; moving the mouse hands the tooltip back to it.
  const [keyboard, setKeyboard] = useState(false)
  // "Now" for the chart, fixed while the page is open.
  const [now] = useState(() => Date.now())

  const box = 'relative mb-[26px] min-h-[272px]'
  if (loading && !records.length) {
    return (
      <div className={box}>
        <Loading />
      </div>
    )
  }
  if (!records.length)
    return <div className={cn(box, 'flex items-center text-text-muted')}>No world record history</div>

  // The whole history: from the first record to today (a week at least, so a new map's first
  // record isn't squashed against the edge).
  const full: Domain = [Math.min(records[0]!.t, now - MIN_SPAN), now]
  const [from, to] = zoom ?? full
  const inView = records.filter((r) => r.t >= from && r.t <= to).length
  const plot = {
    records,
    colorOf,
    full,
    zoom,
    setZoom,
    now,
    atMs: at ? parseTimestamp(at).getTime() : null,
    keyboard,
    setKeyboard,
  }
  const minimap = <WrMinimap records={records} full={full} zoom={zoom} onZoom={setZoom} minSpan={MIN_SPAN} />
  const button =
    'inline-flex h-6 cursor-pointer items-center gap-1 rounded-[4px] border-0 bg-seg-active px-2 text-xs whitespace-nowrap text-text-2 hover:bg-control-raised-2 hover:text-foreground'

  return (
    <div ref={boxRef} className={box}>
      <div className="mb-1 flex min-h-7 items-center gap-2 pr-[34px]">
        <span className="mr-auto text-sm text-text-muted">
          {records.length} world record{records.length === 1 ? '' : 's'}
          {zoom ? ` · ${inView} in view` : ''}
        </span>
        {zoom && (
          <button type="button" onClick={() => setZoom(null)} className={button}>
            Reset zoom
          </button>
        )}
        <button
          type="button"
          aria-label="Expand the WR history"
          onClick={() => setExpanded(true)}
          className={cn(button, 'upto700:hidden')}
        >
          <ExpandIcon className="size-3.5" />
        </button>
        <TrophyFilledIcon className="absolute top-0 right-1.5 z-[1] size-[26px] text-trophy" />
      </div>
      <WrPlot {...plot} onPick={onPick} height={200} />
      {minimap}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent
          className="flex w-[min(1400px,94vw)] max-w-none flex-col gap-3 rounded-md bg-panel p-4 sm:max-w-none"
          onCloseAutoFocus={(e) => {
            if (!pickedInDialog.current) return
            pickedInDialog.current = false
            e.preventDefault()
            boxRef.current?.querySelector<HTMLElement>('[data-wr-plot]')?.focus()
          }}
        >
          <div className="flex items-center gap-3 pr-8">
            <DialogTitle className="text-lg font-semibold">World record history</DialogTitle>
            {zoom && (
              <button type="button" onClick={() => setZoom(null)} className={cn(button, 'ml-auto')}>
                Reset zoom
              </button>
            )}
          </div>
          <div>
            <WrPlot
              {...plot}
              onPick={onPick}
              // Clicking a record shows its board, behind the dialog.
              onClicked={() => {
                pickedInDialog.current = true
                setExpanded(false)
              }}
              height="65vh"
            />
            {minimap}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
