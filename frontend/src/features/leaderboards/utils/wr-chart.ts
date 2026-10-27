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

/**
 * A moment as the address keeps it: whole seconds, rounded up so the board "as it stood" then
 * includes a record set within that second.
 */
export const toSecond = (t: number): number => Math.ceil(t / 1000) * 1000

/** The index of the record standing at `at` (today when null): the latest set by then, -1 if none. */
export function standingRecord(records: { t: number }[], at: number | null): number {
  if (at == null) return records.length - 1
  let i = records.length - 1
  while (i >= 0 && toSecond(records[i]!.t) > at) i--
  return i
}

/**
 * Where an arrow key moves the chart's moment `at` (null: today): to the record before or after.
 * From between two records, left goes to the one standing then. Right of the latest record is today
 * (null); undefined when there's nowhere to go.
 */
export function stepRecord(
  records: { t: number }[],
  at: number | null,
  dir: -1 | 1,
): number | null | undefined {
  if (!records.length) return undefined
  const i = standingRecord(records, at)
  if (dir < 0) {
    // On record i: the one before. Just after it (between records, or today): record i itself.
    const onRecord = at != null && i >= 0 && toSecond(records[i]!.t) === at
    const target = onRecord ? i - 1 : i
    return target >= 0 ? records[target]!.t : undefined
  }
  if (at == null) return undefined
  return i + 1 < records.length ? records[i + 1]!.t : null
}
