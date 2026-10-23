import type { PointsBoardKey, PointsPeak } from '../types'

// The points chart's data and layout (legacy PointsChart in pages/Profile/index.jsx).

/** One sample of GET /profile/points_history, points rounded as legacy showed them. */
export interface PointsSample {
  date: string
  sp: number
  coop: number
  overall: number
}

export interface ChartRow extends Partial<Record<PointsBoardKey, number>> {
  date: string
  t: number
  /** A board's peak, added between the samples (which are weekly and can miss the peak day). */
  peakOf?: PointsBoardKey
}

export const SERIES: { key: PointsBoardKey; label: string; color: string }[] = [
  { key: 'sp', label: 'Singleplayer', color: 'var(--series-sp)' },
  { key: 'coop', label: 'Cooperative', color: 'var(--series-coop)' },
  { key: 'overall', label: 'Overall', color: 'var(--series-overall)' },
]

// The plot's height and top margin (room for the top peak label), and the clear space a peak
// label needs above its dot before it goes below instead.
export const PLOT_H = 128
export const PLOT_TOP = 22
const LABEL_ROOM = 20

export const dayMs = (date: string) => Date.parse(`${date.slice(0, 10)}T00:00:00Z`)

/** The samples plus each board's peak, by date. */
export function chartRows(samples: PointsSample[], peak: PointsPeak | null | undefined): ChartRow[] {
  const rows: ChartRow[] = samples.map((d) => ({ ...d, t: dayMs(d.date) }))
  if (rows.length < 2) return rows
  const extra = SERIES.flatMap(({ key }) => {
    const p = peak?.[key]
    if (!p?.date || !(p.points > 0)) return []
    return [{ date: p.date.slice(0, 10), t: dayMs(p.date), [key]: Math.round(p.points), peakOf: key }]
  })
  return [...rows, ...extra].sort((a, b) => a.t - b.t)
}

/** What's in view, plus the samples either side so the lines run to the edges. */
export function rowsInView(all: ChartRow[], from: number, to: number): ChartRow[] {
  const first = Math.max(0, all.findIndex((d) => d.t >= from) - 1)
  let lastIn = all.length - 1
  while (lastIn > 0 && all[lastIn]!.t > to) lastIn -= 1
  return all.slice(first, Math.min(all.length, lastIn + 2))
}

export type Domain = [number, number | 'dataMax']

/**
 * A line's height scale. The whole history shares one scale from 0 (totals compare); zoomed in,
 * each line gets its own scale fitted to what's in view, so its rises and drops show.
 */
export function domainFor(
  key: PointsBoardKey,
  zoomed: boolean,
  data: ChartRow[],
  from: number,
  to: number,
): Domain {
  if (!zoomed) return [0, 'dataMax']
  const inView = data.filter((d) => d.t >= from && d.t <= to)
  const values = (inView.length ? inView : data).map((d) => d[key]).filter((v): v is number => v != null)
  if (!values.length) return [0, 'dataMax']
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = Math.max(3, (hi - lo) * 0.15)
  return [Math.max(0, Math.floor(lo - pad)), Math.ceil(hi + pad)]
}

/** A line's value at a moment (between its samples). */
export function valueAt(all: ChartRow[], key: PointsBoardKey, t: number): number | null {
  const pts = all.filter((d) => d[key] != null)
  const after = pts.findIndex((d) => d.t >= t)
  if (after < 0) return pts[pts.length - 1]?.[key] ?? null
  const b = pts[after]!
  if (after === 0 || b.t === t) return b[key]!
  const a = pts[after - 1]!
  return a[key]! + ((b[key]! - a[key]!) * (t - a.t)) / (b.t - a.t)
}

/**
 * Where a peak's label goes: above its dot unless another shown line runs through that space;
 * then below, or whichever side has more room.
 */
export function labelSide(
  all: ChartRow[],
  data: ChartRow[],
  shown: PointsBoardKey[],
  zoomed: boolean,
  [from, to]: [number, number],
  key: PointsBoardKey,
  t: number,
  v: number,
): 'top' | 'bottom' {
  const sharedMax = Math.max(1, ...data.flatMap((d) => shown.map((s) => d[s] ?? 0)))
  // Where a value sits on its line's scale, in pixels from the top of the plot.
  const yPx = (k: PointsBoardKey, value: number) => {
    const [lo, hi] = zoomed
      ? domainFor(k, true, data, from, to).map((x) => (x === 'dataMax' ? sharedMax : x))
      : [0, sharedMax]
    return PLOT_H - ((value - (lo as number)) / Math.max(1, (hi as number) - (lo as number))) * PLOT_H
  }
  const y = yPx(key, v)
  let above = y + PLOT_TOP
  let below = PLOT_H - y
  for (const other of shown) {
    if (other === key) continue
    const o = valueAt(all, other, t)
    if (o == null) continue
    const oy = yPx(other, o)
    if (oy <= y) above = Math.min(above, y - oy)
    else below = Math.min(below, oy - y)
  }
  return above >= LABEL_ROOM || above >= below ? 'top' : 'bottom'
}
