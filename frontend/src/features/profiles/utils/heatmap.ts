import { parseTimestamp } from '@/lib/format'
import type { Run } from '@/types/runs'

// The profile's activity calendar (legacy pages/Profile/ActivityHeatmap.jsx). Days are UTC.

export const DAY = 24 * 3600 * 1000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const dayKey = (d: Date) => d.toISOString().slice(0, 10)
export const utcDay = (key: string) => new Date(`${key}T00:00:00Z`)

export interface HeatCell {
  date: Date
  /** The last day a multi-day square covers. */
  to?: Date
  n: number
}

/** A square, or an empty slot outside the range. */
export type HeatSlot = (HeatCell & { inRange: true }) | { inRange: false }

export interface HeatGrid {
  /** Columns of seven slots. */
  weeks: HeatSlot[][]
  /** A label (month or year) per column, mostly empty. */
  labels: string[]
  total: number
  busiest: number
  activeDays: number
  busiestDay: number
  /** Days per square. */
  span: number
}

/** Runs per day (banned runs left out). */
export function runCounts(history: Run[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const h of history) {
    if (!h.timestamp || h.banned) continue
    const k = dayKey(parseTimestamp(h.timestamp))
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

/** The runs behind each day, oldest first, for the hover card. */
export function runsByDay(history: Run[]): Map<string, Run[]> {
  const m = new Map<string, Run[]>()
  for (const h of history) {
    if (!h.timestamp || h.banned) continue
    const k = dayKey(parseTimestamp(h.timestamp))
    m.set(k, [...(m.get(k) ?? []), h])
  }
  for (const list of m.values())
    list.sort((a, b) => parseTimestamp(a.timestamp!).getTime() - parseTimestamp(b.timestamp!).getTime())
  return m
}

/** Colour level for a day's run count (0 = none). */
export const level = (n: number) => (n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4)

/** Multi-day squares are shaded relative to the busiest square. */
export const scaledLevel = (n: number, max: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)))

/** Weeks (Sunday first) covering start..end, each day with its run count, plus month labels and totals. */
export function buildGrid(counts: Map<string, number>, start: Date, end: Date): HeatGrid {
  const first = new Date(start.getTime() - start.getUTCDay() * DAY)
  const weeks: HeatSlot[][] = []
  let total = 0
  let busiest = 0
  let activeDays = 0
  for (let w = first; w <= end; w = new Date(w.getTime() + 7 * DAY)) {
    const days: HeatSlot[] = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(w.getTime() + i * DAY)
      const inRange = date >= start && date <= end
      const n = inRange ? (counts.get(dayKey(date)) ?? 0) : 0
      if (n) {
        total += n
        activeDays += 1
        busiest = Math.max(busiest, n)
      }
      // Legacy kept days outside the range as squares that render empty.
      days.push(inRange ? { date, n, inRange: true } : { inRange: false })
    }
    weeks.push(days)
  }
  // Month labels on the week holding the 1st; the first week gets its month unless a label follows right after.
  const labels = weeks.map((days) => {
    const d = days.find((x): x is HeatCell & { inRange: true } => x.inRange && x.date.getUTCDate() === 1)
    return d ? MONTHS[d.date.getUTCMonth()]! : ''
  })
  if (!labels[0] && !labels[1] && !labels[2]) labels[0] = MONTHS[start.getUTCMonth()]!
  return { weeks, labels, total, busiest, activeDays, busiestDay: busiest, span: 1 }
}

export const yearGrid = (counts: Map<string, number>, year: number) =>
  buildGrid(counts, new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year, 11, 31)))

/**
 * The whole career in one calendar-sized grid: each square covers `span` days (sized to fit in
 * about a year's worth of squares), filled top to bottom, then left to right.
 */
export function allTimeGrid(counts: Map<string, number>, start: Date, end: Date): HeatGrid {
  const days = Math.round((end.getTime() - start.getTime()) / DAY) + 1
  const span = Math.max(1, Math.ceil(days / 371))
  const weeks: HeatSlot[][] = []
  let total = 0
  let busiest = 0
  for (let c = 0; c * span * 7 < days; c++) {
    const col: HeatSlot[] = []
    for (let i = 0; i < 7; i++) {
      const from = new Date(start.getTime() + (c * 7 + i) * span * DAY)
      if (from > end) {
        col.push({ inRange: false })
        continue
      }
      let n = 0
      for (let k = 0; k < span; k++) n += counts.get(dayKey(new Date(from.getTime() + k * DAY))) ?? 0
      const to = new Date(Math.min(from.getTime() + (span - 1) * DAY, end.getTime()))
      total += n
      busiest = Math.max(busiest, n)
      col.push({ date: from, to, n, inRange: true })
    }
    weeks.push(col)
  }
  // Year labels on the column where each year starts.
  const yearOf = (col: HeatSlot[] | undefined) => {
    const top = col?.[0]
    return top?.inRange ? top.date.getUTCFullYear() : null
  }
  const labels = weeks.map((col, i) => {
    const y = yearOf(col)
    return i === 0 || y !== yearOf(weeks[i - 1]) ? String(y) : ''
  })
  return {
    weeks,
    labels,
    total,
    busiest,
    span,
    // Day-based figures for the summary line.
    activeDays: counts.size,
    busiestDay: Math.max(0, ...counts.values()),
  }
}

export type HeatRange = 'past' | 'all' | number

/** The grid for a range: the past year (to `today`), all time, or one calendar year. */
export function heatGrid(counts: Map<string, number>, range: HeatRange, today: Date): HeatGrid {
  if (range === 'all') {
    const first = [...counts.keys()].sort()[0] ?? dayKey(today)
    return allTimeGrid(counts, utcDay(first), today)
  }
  if (range === 'past') return buildGrid(counts, new Date(today.getTime() - 364 * DAY), today)
  return yearGrid(counts, range)
}

/** Years with runs, newest first, and every year between them (empty ones disabled). */
export function yearOptions(counts: Map<string, number>) {
  const years = [...new Set([...counts.keys()].map((k) => Number(k.slice(0, 4))))].sort((a, b) => b - a)
  const options: { value: string; label: string; disabled: boolean }[] = []
  if (!years.length) return { years, options }
  for (let y = years[0]!; y >= years[years.length - 1]!; y--) {
    options.push({ value: String(y), label: String(y), disabled: !years.includes(y) })
  }
  return { years, options }
}
