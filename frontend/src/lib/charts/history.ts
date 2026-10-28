import { formatDate } from '@/lib/format'
import { stepPoints } from './steps'

const DAY_MS = 24 * 3600 * 1000
/** The narrowest a history chart zooms in to. */
export const HISTORY_MIN_SPAN = 7 * DAY_MS

const pad2 = (n: number) => String(n).padStart(2, '0')

/** A moment as a history tooltip says it: the day and the time of day. */
export function formatWhen(t: number): string {
  const d = new Date(t)
  return `${formatDate(t)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/**
 * A time on a history chart (world records, or a player's runs): when it was set (`t`), who set it
 * and how much it took off the one before.
 */
export interface HistoryPoint {
  t: number
  score: number
  player: string
  gain: number | null
  /** A copy carrying a time along its flat line (not set at `t`). */
  carried?: boolean
  /** The end of the line is today. */
  now?: boolean
  /** When a carried time was set (its tooltip says that day). */
  setAt?: number
}

/**
 * The chart's points between `from` and `to`: the time standing at the start, those set in view,
 * and the one standing at the end carried on to it (today, unless zoomed in). Each time's flat line
 * has a point at both ends carrying it (see [stepPoints]), so hovering anywhere along it shows that
 * time, not the next one or none.
 */
export function historyChartData<P extends HistoryPoint>(
  records: P[],
  from: number,
  to: number,
  now: number,
): P[] {
  const before = records.filter((r) => r.t < from)
  const inRange = records.filter((r) => r.t >= from && r.t <= to)
  const start = before[before.length - 1]
  const points = stepPoints(
    [...(start ? [{ ...start, t: from, carried: true, setAt: start.t }] : []), ...inRange],
    to,
  )
  const last = points[points.length - 1]
  // The end is "now" (clicking it picks today) when the view reaches today.
  if (last && last.t === to && last.carried)
    points[points.length - 1] = { ...last, now: to >= now, carried: to < now }
  return points
}

/** The point nearest to `t` along the time axis (the first of two as near). */
export function nearestPoint<P extends { t: number }>(points: P[], t: number): P | undefined {
  let best: P | undefined
  for (const p of points) if (!best || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p
  return best
}

/**
 * A moment as the address keeps it: whole seconds, rounded up so the board "as it stood" then
 * includes a record set within that second.
 */
export const toSecond = (t: number): number => Math.ceil(t / 1000) * 1000

/** The index of the time standing at `at` (today when null): the latest set by then, -1 if none. */
export function standingRecord(records: { t: number }[], at: number | null): number {
  if (at == null) return records.length - 1
  let i = records.length - 1
  while (i >= 0 && toSecond(records[i]!.t) > at) i--
  return i
}

/**
 * Where an arrow key moves the chart's moment `at` (null: today): to the time before or after the
 * one standing then, wherever along its line `at` is. Times set the same second (a co-op run's two
 * halves, or a tie) are one step: stepping back onto the other would land on the same moment again.
 * From today left goes to the latest time; right of the latest is today (null); undefined when
 * there's nowhere to go.
 */
export function stepRecord(
  records: { t: number }[],
  at: number | null,
  dir: -1 | 1,
): number | null | undefined {
  if (!records.length) return undefined
  if (at == null) return dir < 0 ? records[records.length - 1]!.t : undefined
  const i = standingRecord(records, at)
  if (dir > 0) return i + 1 < records.length ? records[i + 1]!.t : null
  if (i < 0) return undefined
  const moment = toSecond(records[i]!.t)
  let before = i - 1
  while (before >= 0 && toSecond(records[before]!.t) >= moment) before--
  return before >= 0 ? records[before]!.t : undefined
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
