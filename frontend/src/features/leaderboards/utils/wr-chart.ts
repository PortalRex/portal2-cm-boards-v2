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

/** The dots' colours, readable on light and dark: each record holder gets one. */
export const PLAYER_COLORS = [
  '#ee4444',
  '#44bbee',
  '#f0c03e',
  '#6666ee',
  '#4ed07a',
  '#c279e5',
  '#ee8844',
  '#e96bb0',
]

/**
 * A colour for each record holder (by name, ignoring case), in the order they first set a record,
 * going round again past the last colour. `records` must be oldest first.
 */
export function playerColors(records: { player: string }[]): (player: string) => string {
  const colors = new Map<string, string>()
  for (const { player } of records) {
    const key = player.toLowerCase()
    if (!colors.has(key)) colors.set(key, PLAYER_COLORS[colors.size % PLAYER_COLORS.length]!)
  }
  return (player) => colors.get(player.toLowerCase()) ?? PLAYER_COLORS[0]!
}

// Gaps between the time axis' lines, in centiseconds: round times from 0.01s to 10 minutes.
const SCORE_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 3000, 6000, 12000, 30000, 60000]

/**
 * The time axis for scores from `min` to `max` (centiseconds): lines at round times, at most
 * `count` of them, with the lowest below `min` (or on it) and the highest above `max`.
 */
export function scoreTicks(min: number, max: number, count = 5): number[] {
  for (const step of SCORE_STEPS) {
    let lo = Math.floor(min / step) * step
    let hi = Math.ceil(max / step) * step
    // One time: a line either side of it.
    if (lo === hi) [lo, hi] = [lo - step, hi + step]
    if ((hi - lo) / step + 1 <= count)
      return Array.from({ length: (hi - lo) / step + 1 }, (_, i) => lo + i * step)
  }
  return [min, max]
}
