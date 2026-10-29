import type { ReplayRuns } from '@/lib/runs/viewer'
import type { RankedRun } from '@/types/runs'

/** A board run's demos: a co-op run's both (the host's first), else its one. */
export const demosOf = (run: RankedRun): number[] =>
  (run.demoIds ?? [run.demoId]).filter((id): id is number => Boolean(id))

/**
 * Board runs raced in the replay (in board order): the first shown, with its co-op partner's demo,
 * and each of the others raced by one demo (a co-op demo shows both players). Null without demos.
 */
export function raceReplay(runs: readonly RankedRun[]): ReplayRuns | null {
  const [first, ...rest] = runs.filter((r) => demosOf(r).length)
  if (!first) return null
  return { open: demosOf(first), race: rest.map((r) => demosOf(r)[0]!) }
}

/** The board's top `count` runs with demos, raced. */
export const topReplay = (board: readonly RankedRun[], count: number) =>
  raceReplay(board.filter((r) => demosOf(r).length).slice(0, count))

/** The board's top `count` runs with demos as a swarm, the best of them shown. */
export function swarmReplay(board: readonly RankedRun[], count: number): ReplayRuns | null {
  const runs = board.filter((r) => demosOf(r).length).slice(0, count)
  if (!runs.length) return null
  return { open: demosOf(runs[0]!), swarm: runs.map((r) => demosOf(r)[0]!) }
}

/** World records' demos (newest first): the newest shown, the older ones (up to `count` in all) raced. */
export function wrReplay(demos: readonly number[], count: number): ReplayRuns | null {
  if (!demos.length) return null
  return { open: [demos[0]!], race: demos.slice(1, count) }
}
