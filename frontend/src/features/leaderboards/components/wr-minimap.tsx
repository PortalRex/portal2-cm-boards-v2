import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { fitDomain } from '@/hooks/use-wheel-zoom'
import { timeTicks } from '../utils/time-ticks'
import { wrChartData, type ChartPoint } from '../utils/wr-chart'

type Domain = [number, number]
type Drag = { mode: 'move' | 'start' | 'end'; x: number; from: number; to: number }

/**
 * The whole history in small under the chart, with the part in view as a window: drag the window to
 * move the view, drag its edges to zoom, click beside it to move it there.
 */
export function WrMinimap({
  records,
  full,
  zoom,
  onZoom,
  minSpan,
}: {
  records: ChartPoint[]
  full: Domain
  zoom: Domain | null
  onZoom: (domain: Domain | null) => void
  minSpan: number
}) {
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [f0, f1] = full
  const span = f1 - f0
  const [from, to] = zoom ?? full
  const pct = (t: number) => ((t - f0) / span) * 100
  const data = wrChartData(records, f0, f1, f1)
  const scores = data.map((d) => d.score)
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const pad = Math.max(1, (max - min) * 0.1)
  const { ticks, label } = timeTicks(f0, f1)
  // Labels too near an edge would be cut in half.
  const labelled = ticks.filter((t) => pct(t) > 4 && pct(t) < 96)

  const msPerPixel = () => span / Math.max(1, box.current?.getBoundingClientRect().width ?? 1)
  const start = (e: ReactPointerEvent, mode: Drag['mode'], view: Domain = [from, to]) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { mode, x: e.clientX, from: view[0], to: view[1] }
  }
  const move = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    const by = (e.clientX - d.x) * msPerPixel()
    if (d.mode === 'move') onZoom(fitDomain(full, d.from + by, d.to - d.from))
    else if (d.mode === 'start') {
      const a = Math.min(Math.max(f0, d.from + by), d.to - minSpan)
      onZoom(fitDomain(full, a, d.to - a))
    } else {
      const b = Math.max(Math.min(f1, d.to + by), d.from + minSpan)
      onZoom(fitDomain(full, d.from, b - d.from))
    }
  }
  const end = () => {
    drag.current = null
  }

  return (
    <div
      ref={box}
      data-testid="wr-minimap"
      className="relative mt-1 h-10 w-full touch-pan-y overflow-hidden rounded-[4px] select-none"
      // Beside the window: move it there (centred on the click), and keep dragging it from there.
      onPointerDown={(e) => {
        if (!zoom || !box.current) return
        const at = f0 + (e.clientX - box.current.getBoundingClientRect().left) * msPerPixel()
        const view = fitDomain(full, at - (to - from) / 2, to - from)
        onZoom(view)
        if (view) start(e, 'move', view)
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="pointer-events-none absolute inset-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <XAxis dataKey="t" type="number" domain={full} hide />
            <YAxis domain={[min - pad, max + pad]} hide />
            <Area
              type="stepAfter"
              dataKey="score"
              stroke="var(--wr-line)"
              strokeWidth={1}
              fill="var(--wr-line)"
              fillOpacity={0.15}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-control-raised/30" />
      <div
        className="pointer-events-none absolute inset-y-0 left-0 bg-control-raised/60"
        style={{ width: `${pct(from)}%` }}
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 bg-control-raised/60"
        style={{ width: `${100 - pct(to)}%` }}
      />
      <div className="pointer-events-none absolute inset-0 text-[11px] text-text-muted">
        {labelled.map((t) => (
          <span key={t} className="absolute bottom-0 -translate-x-1/2" style={{ left: `${pct(t)}%` }}>
            {label(t)}
          </span>
        ))}
      </div>
      <div
        data-testid="wr-minimap-window"
        className="absolute inset-y-0 cursor-grab border-x border-brand bg-linear-to-b from-transparent to-brand/20 active:cursor-grabbing"
        style={{ left: `${pct(from)}%`, width: `${pct(to) - pct(from)}%` }}
        onPointerDown={(e) => start(e, 'move')}
      >
        {(['start', 'end'] as const).map((edge) => (
          <div
            key={edge}
            className={`absolute top-1/2 h-4 w-1 -translate-y-1/2 cursor-ew-resize rounded-full bg-text-2 ${edge === 'start' ? '-left-0.5' : '-right-0.5'}`}
            onPointerDown={(e) => start(e, edge)}
          />
        ))}
      </div>
    </div>
  )
}
