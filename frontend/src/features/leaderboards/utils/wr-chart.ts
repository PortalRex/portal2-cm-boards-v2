import type { HistoryPoint } from '@/lib/charts/history'
import type { ChangelogRaw } from '@/types/runs'
import type { WrPoint } from '../api/map-board'

const known = (name: string | null): name is string => Boolean(name) && name !== 'N/A'

/**
 * The records as runs: a co-op run's two players' entries (the same co-op run, set within a second
 * of each other) become one, at the earlier time, named after both partners (blue first).
 */
export function wrRuns(rows: ChangelogRaw[]): WrPoint[] {
  const runs = new Map<string, ChangelogRaw[]>()
  for (const r of rows) {
    const key = r.coop_id != null ? `coop:${r.coop_id}` : `run:${r.id}`
    runs.set(key, [...(runs.get(key) ?? []), r])
  }
  return [...runs.values()].map((halves) => {
    const first = halves.reduce((a, b) => ((b.timestamp ?? '') < (a.timestamp ?? '') ? b : a))
    // The partners as the run has them, or (a half the run doesn't know the other of) as the entries do.
    const pair = [first.blue_name, first.orange_name].filter(known)
    const names = pair.length === 2 ? pair : [...new Set(halves.map((h) => h.user_name))]
    return { timestamp: first.timestamp, score: first.score, player: names.join(' & ') }
  })
}

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
export interface ChartPoint extends WrPoint, HistoryPoint {}
