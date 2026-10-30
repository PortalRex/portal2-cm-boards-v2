import type { HistoryPoint } from '@/lib/charts/history'
import type { ChangelogRaw } from '@/types/runs'
import type { WrPoint } from '../api/map-board'

const known = (name: string | null): name is string => Boolean(name) && name !== 'N/A'
// As run details name the filler user of an unpaired co-op half.
const UNKNOWN_PARTNER = 'Unknown partner'

// Co-op halves of one record set this close together are one run, whatever runs they're filed under.
const SAME_RUN_MS = 5000

const time = (r: ChangelogRaw) => (r.timestamp ? Date.parse(`${r.timestamp}Z`) : 0)
const isCoop = (r: ChangelogRaw) => r.coop_id != null || r.blue_name != null

/**
 * The records as runs: a co-op run's two players' entries become one, at the earlier time, named
 * after both partners (blue first). Halves of one record filed as separate co-op runs (the old
 * boards' unpaired or mispaired halves: the same time, set within seconds) are one too, named after
 * a run's pair when it covers everyone in them, else after the players who have the entries.
 */
export function wrRuns(rows: ChangelogRaw[]): WrPoint[] {
  const filed = new Map<string, ChangelogRaw[]>()
  for (const r of rows) {
    const key = r.coop_id != null ? `coop:${r.coop_id}` : `run:${r.id}`
    filed.set(key, [...(filed.get(key) ?? []), r])
  }
  const runs: ChangelogRaw[][] = []
  const byTime = [...filed.values()].sort((a, b) => Math.min(...a.map(time)) - Math.min(...b.map(time)))
  for (const run of byTime) {
    const last = runs[runs.length - 1]
    const sameRecord =
      last &&
      isCoop(run[0]!) &&
      isCoop(last[0]!) &&
      run[0]!.score === last[0]!.score &&
      Math.min(...run.map(time)) - Math.min(...last.map(time)) <= SAME_RUN_MS
    if (sameRecord) last.push(...run)
    else runs.push([...run])
  }
  return runs.map((halves) => {
    const first = halves.reduce((a, b) => (time(b) < time(a) ? b : a))
    const players = [...new Set(halves.map((h) => h.user_name))]
    // A run's partners, when they cover everyone with an entry; else the entries' players.
    const pair = halves
      .map((h) => [h.blue_name, h.orange_name].filter(known))
      .find((p) => p.length === 2 && players.every((name) => p.includes(name)))
    const names = pair ?? (isCoop(first) && players.length === 1 ? withUnknownPartner(first) : players)
    return { timestamp: first.timestamp, score: first.score, player: names.join(' & ') }
  })
}

/** A co-op half whose partner isn't known: the player and an unknown partner, in their colours' order. */
function withUnknownPartner(half: ChangelogRaw): string[] {
  const player = half.user_name
  return half.orange_name === player ? [UNKNOWN_PARTNER, player] : [player, UNKNOWN_PARTNER]
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
