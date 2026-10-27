import { stepPoints } from '@/lib/charts/steps'
import type { WrPoint } from '../api/map-board'

/**
 * The records that were the best yet, oldest first: each as fast as every one before it or faster
 * (a tie is a record too). `points` must be oldest first.
 */
export function runningBest(points: WrPoint[]): WrPoint[] {
  let best = Infinity
  return points.filter((p) => {
    if (p.score > best) return false
    best = p.score
    return true
  })
}

/** A world record on the chart: when it was set (`t`) and how much it took off the one before. */
export interface ChartPoint extends WrPoint {
  t: number
  gain: number | null
  /** A copy carrying a record along its flat line (not set at `t`). */
  carried?: boolean
  /** The end of the line is today. */
  now?: boolean
  /** When a carried record was set (its tooltip says that day). */
  setAt?: number
}

/**
 * The chart's points between `from` and `to`: the record standing at the start, those set in view,
 * and the one standing at the end carried on to it (today, unless zoomed in). Each record's flat
 * line has a point at both ends carrying it (see [stepPoints]), so hovering anywhere along it shows
 * that record, not the next one or none.
 */
export function wrChartData(records: ChartPoint[], from: number, to: number, now: number): ChartPoint[] {
  const before = records.filter((r) => r.t < from)
  const inRange = records.filter((r) => r.t >= from && r.t <= to)
  const start = before[before.length - 1]
  const points = stepPoints(
    [...(start ? [{ ...start, t: from, carried: true, setAt: start.t }] : []), ...inRange],
    to,
  )
  const last = points[points.length - 1]
  // The end is "now" (clicking it shows today's board) when the view reaches today.
  if (last && last.t === to && last.carried)
    points[points.length - 1] = { ...last, now: to >= now, carried: to < now }
  return points
}
