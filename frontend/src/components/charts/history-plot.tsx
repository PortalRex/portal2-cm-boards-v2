import { cn } from 'cn'
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
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
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons'
import { panDomain, pinchDomain, revealDomain, useWheelZoomOn } from '@/hooks/use-wheel-zoom'
import {
  formatWhen,
  HISTORY_MIN_SPAN,
  historyChartData,
  nearestPoint,
  scoreTicks,
  standingRecord,
  stepRecord,
  type HistoryPoint,
} from '@/lib/charts/history'
import { timeTicks } from '@/lib/charts/time-ticks'
import { formatScore } from '@/lib/format'

type Domain = [number, number]

// The plot's margins: the time axis' labels on the left, a little room on the right.
const AXIS_WIDTH = 56
const RIGHT = 12
const stepButton =
  'inline-flex size-8 flex-none cursor-pointer items-center justify-center rounded-[4px] border border-line bg-control text-text-2 active:bg-control-raised'
// How far the pointer moves before a press becomes a drag (and not a click).
const DRAG_PX = 4

/** A time's tooltip: when, who (in their colour), the time and how much it took off; then `children`. */
export function HistoryTooltip({
  when,
  name,
  color,
  score,
  gain,
  children,
}: {
  when: string
  name: string
  color: string
  score: number
  gain: number | null
  children?: ReactNode
}) {
  return (
    <div className="flex min-w-36 flex-col gap-1 rounded-md border border-line bg-menu px-2.5 py-1.5 text-xs shadow-[0_8px_24px_rgb(0_0_0/45%)]">
      <span className="font-medium">{when}</span>
      <div className="flex items-center justify-between gap-4">
        <span className="flex min-w-0 items-center gap-1.5 text-text-2">
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="min-w-0 [overflow-wrap:anywhere]">{name}</span>
        </span>
        <span className="num shrink-0 font-medium">
          {formatScore(score)}
          {gain != null && <span className="text-text-muted"> (−{formatScore(gain)})</span>}
        </span>
      </div>
      {children}
    </div>
  )
}

/**
 * Two-finger zoom along a chart's time axis. Moving both fingers slides the view along with them.
 * It reads every finger on the screen from each touch event (a pinch out starts wide apart, so
 * the second finger often lands off the chart), rather than keeping its own list of them: a phone
 * browser that drops a finger's "lifted" event would leave that list holding a finger that isn't
 * there, and every pinch after it would be measured from it. A pinch starts only with a finger on
 * the chart; while one is on, the browser's own zoom and scroll stay out of it. Returns the
 * chart's ref and whether a pinch is on (the chart's own drag stands aside); `onStart` runs as one
 * begins.
 */
function usePinchZoom(
  full: Domain,
  zoom: Domain | null,
  setZoom: Dispatch<SetStateAction<Domain | null>>,
  onStart: () => void,
) {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const active = useRef(false)
  const live = useRef({ full, zoom, onStart })
  useEffect(() => {
    live.current = { full, zoom, onStart }
  })

  useEffect(() => {
    if (!el) return
    // The view and the moment between the fingers (0-1 across) when the pinch began, and how far
    // apart they were.
    let pinch: { view: Domain; from: number; dist: number } | null = null
    const across = (x: number) => {
      const rect = el.getBoundingClientRect()
      const plot = Math.max(1, rect.width - AXIS_WIDTH - RIGHT)
      return Math.min(1, Math.max(0, (x - rect.left - AXIS_WIDTH) / plot))
    }
    const onTouch = (e: TouchEvent) => {
      const [a, b] = [e.touches[0], e.touches[1]]
      if (!a || !b) {
        pinch = null
        active.current = false
        return
      }
      const mid = (a.clientX + b.clientX) / 2
      const dist = Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY))
      if (!pinch) {
        if (![...e.touches].some((t) => t.target instanceof Node && el.contains(t.target))) return
        const { zoom, full, onStart } = live.current
        pinch = { view: zoom ?? full, from: across(mid), dist }
        active.current = true
        onStart()
      }
      if (e.cancelable) e.preventDefault()
      if (e.type !== 'touchmove') return
      const scale = pinch.dist / dist
      setZoom(pinchDomain(pinch.view, live.current.full, pinch.from, across(mid), scale, HISTORY_MIN_SPAN))
    }
    const events = ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const
    for (const type of events) window.addEventListener(type, onTouch, { passive: false })
    return () => {
      for (const type of events) window.removeEventListener(type, onTouch)
      active.current = false
    }
  }, [el, setZoom])

  return { ref: setEl, active }
}

export interface HistoryPlotProps<P extends HistoryPoint> {
  /** Oldest first. */
  records: P[]
  /** A dot's colour, by the point's `player`. */
  colorOf: (player: string) => string
  /** The whole history's [from, to]; `zoom` the part in view (null: all of it). */
  full: Domain
  zoom: Domain | null
  setZoom: Dispatch<SetStateAction<Domain | null>>
  now: number
  /** The picked moment (null: today). */
  atMs: number | null
  /** The arrow keys picked it: its tooltip shows until the mouse moves. */
  keyboard: boolean
  setKeyboard: (on: boolean) => void
  /** A click or arrow key picked a moment (null: today). */
  onPick: (t: number | null) => void
  /** After a click picked a moment (not the arrow keys). */
  onClicked?: () => void
  height: number | string
  /** What the chart is, for screen readers, and its hover hint. */
  label: string
  hint: string
  tooltip: (point: P, color: string) => ReactNode
  /** Points drawn as hollow dots. */
  hollow?: (point: P) => boolean
}

/**
 * A history chart: a step line of the time standing at each moment, a dot (in its player's colour)
 * for each time set. Scroll or pinch to zoom, drag to move along; click to pick a moment, and the
 * arrow keys (or, on a touch screen, the Earlier / Later buttons under it) step to the time before
 * or after.
 */
export function HistoryPlot<P extends HistoryPoint>({
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
  label,
  hint,
  tooltip,
  hollow,
}: HistoryPlotProps<P>) {
  const wheelRef = useWheelZoomOn(full, setZoom, {
    left: AXIS_WIDTH,
    right: RIGHT,
    minSpan: HISTORY_MIN_SPAN,
  })
  const drag = useRef<{ x: number; view: Domain | null; moved: boolean } | null>(null)
  const [dragging, setDragging] = useState(false)
  // A pinch just ended: the tap the browser may send after it isn't a pick.
  const pinched = useRef(false)
  const pinch = usePinchZoom(full, zoom, setZoom, () => {
    // A second finger: a pinch, instead of the drag the first one started.
    pinched.current = true
    drag.current = null
    setDragging(false)
  })
  const pinchRef = pinch.ref
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      wheelRef(el)
      pinchRef(el)
    },
    [wheelRef, pinchRef],
  )
  // Each chart's own gradient: two can be on the page at once.
  const fillId = `historyFill${useId().replace(/[^\w-]/g, '')}`

  const [from, to] = zoom ?? full
  const data = historyChartData(records, from, to, now)
  const scores = data.map((d) => d.score)
  const yTicks = scoreTicks(Math.min(...scores), Math.max(...scores))
  const { ticks, label: tickLabel } = timeTicks(from, to)
  // The time standing at the picked moment (none: today), and the one the arrow keys picked.
  const standing = atMs == null ? undefined : records[standingRecord(records, atMs)]
  const picked = keyboard ? records[standingRecord(records, atMs)] : undefined
  const step = (dir: -1 | 1) => {
    const next = stepRecord(records, atMs, dir)
    if (next === undefined) return
    setKeyboard(true)
    onPick(next)
    // Stepping off the zoomed view moves it along to the time (or today).
    setZoom((d) => revealDomain(d, full, next ?? now))
  }

  return (
    <>
      <div
        ref={ref}
        data-history-plot
        // Focused by a click, so the arrow keys work from there.
        tabIndex={0}
        aria-label={label}
        className={cn(
          // Recharts' layers take focus on a click too; the ring goes round the whole chart.
          'relative touch-pan-y rounded-[4px] outline-none select-none focus-visible:ring-2 focus-visible:ring-brand [&_*:focus]:outline-none',
          dragging ? 'cursor-grabbing' : 'cursor-pointer',
        )}
        style={{ height }}
        title={hint}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
          e.preventDefault()
          step(e.key === 'ArrowLeft' ? -1 : 1)
        }}
        onPointerDown={(e) => {
          // A touch (or click) on the chart hands the tooltip back from the arrow keys' pick: a
          // finger doesn't move a pointer over it first, as a mouse does.
          if (keyboard) setKeyboard(false)
          if (pinch.active.current) return
          pinched.current = false
          if (e.button === 0) drag.current = { x: e.clientX, view: zoom, moved: false }
        }}
        onPointerMove={(e) => {
          if (keyboard) setKeyboard(false)
          if (pinch.active.current) return
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
        onPointerCancel={() => {
          setDragging(false)
          drag.current = null
        }}
        onClickCapture={(e) => {
          if (drag.current?.moved || pinched.current) e.stopPropagation()
          drag.current = null
          pinched.current = false
        }}
        // The point under the click, as the tooltip finds it (nearest along the time axis). Worked out
        // from where the click is: the chart's own hover state lags behind a tap or a quick click.
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const frac = (e.clientX - rect.left - AXIS_WIDTH) / Math.max(1, rect.width - AXIS_WIDTH - RIGHT)
          if (frac < 0 || frac > 1) return
          const p = nearestPoint(data, from + frac * (to - from))
          if (!p) return
          onPick(p.now ? null : p.t)
          onClicked?.()
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            // The arrow keys are handled above (they pick a moment too).
            accessibilityLayer={false}
            margin={{ top: 8, right: RIGHT, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--history-line)" stopOpacity={0.32} />
                <stop offset="95%" stopColor="var(--history-line)" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[from, to]}
              ticks={ticks}
              tickFormatter={tickLabel}
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
                const p = active && !keyboard ? (payload?.[0]?.payload as P | undefined) : undefined
                return p ? tooltip(p, colorOf(p.player)) : null
              }}
              cursor={keyboard ? false : { stroke: 'var(--line-strong)', strokeOpacity: 0.6 }}
            />
            {atMs != null && atMs >= from && atMs <= to && (
              <ReferenceLine x={atMs} stroke="var(--brand)" strokeDasharray="4 3" />
            )}
            <Area
              type="stepAfter"
              dataKey="score"
              stroke="var(--history-line)"
              strokeWidth={1.5}
              fill={`url(#${fillId})`}
              dot={({
                cx,
                cy,
                payload,
                index,
              }: {
                cx?: number
                cy?: number
                payload?: P
                index?: number
              }) => {
                // Copies carrying a time along its line get no dot: only the times set do.
                if (!payload || payload.carried || payload.now || cx == null || cy == null)
                  return <g key={index} />
                const color = colorOf(payload.player)
                const empty = hollow?.(payload)
                return (
                  <circle
                    key={index}
                    cx={cx}
                    cy={cy}
                    r={3.5}
                    fill={empty ? 'var(--panel)' : color}
                    fillOpacity={empty ? 1 : 0.85}
                    stroke={empty ? color : 'none'}
                    strokeWidth={1.5}
                  />
                )
              }}
              activeDot={
                keyboard
                  ? false
                  : ({ cx, cy, payload }: { cx?: number; cy?: number; payload?: P }) => (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={6}
                        fill={payload ? colorOf(payload.player) : 'var(--history-line)'}
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
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
        {/* The picked time's tooltip beside its dot (to the right, or left near the end), over the
            chart so no dot covers it. Drawn by hand: the chart's own tooltip follows the mouse. */}
        {picked && picked.t >= from && picked.t <= to && (
          <div
            className="pointer-events-none absolute top-0 z-[1] w-max max-w-[260px]"
            style={{
              left: `calc(${AXIS_WIDTH}px + (100% - ${AXIS_WIDTH + RIGHT}px) * ${(picked.t - from) / (to - from)})`,
              transform:
                (picked.t - from) / (to - from) < 0.6 ? 'translateX(12px)' : 'translateX(calc(-100% - 12px))',
            }}
          >
            {tooltip(picked, colorOf(picked.player))}
          </div>
        )}
      </div>
      {/* Touch screens have no arrow keys, and a finger misses records that sit close together: a bar
          to step through them, saying which one is picked. */}
      <div className="mt-1 hidden h-8 items-center gap-1.5 pointer-coarse:flex">
        <button type="button" aria-label="Earlier" onClick={() => step(-1)} className={stepButton}>
          <ChevronLeftIcon className="size-4" />
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-[13px] text-text-2">
          {standing ? (
            <>
              <span className="text-text-muted">{formatWhen(standing.t)} · </span>
              {standing.player && `${standing.player} · `}
              <span className="num font-semibold text-foreground">{formatScore(standing.score)}</span>
            </>
          ) : (
            'Today'
          )}
        </span>
        <button type="button" aria-label="Later" onClick={() => step(1)} className={stepButton}>
          <ChevronRightIcon className="size-4" />
        </button>
      </div>
    </>
  )
}
