import type { RankedRun } from '@/types/runs'

/**
 * For each co-op run, the players for whom it isn't their personal best: a player who carried
 * partners to new PBs appears again on slower runs. Their best is their fastest run; a tie goes
 * to the earlier one on the board.
 */
export function nonPbPlayers(runs: RankedRun[]): Map<RankedRun, Set<string>> {
  const best = new Map<string, RankedRun>()
  for (const run of runs) {
    for (const { profileNumber: id } of run.players) {
      if (!id) continue
      const current = best.get(id)
      if (!current || run.score < current.score) best.set(id, run)
    }
  }
  const result = new Map<RankedRun, Set<string>>()
  for (const run of runs) {
    const others = run.players.flatMap((p) =>
      p.profileNumber && best.get(p.profileNumber) !== run ? [p.profileNumber] : [],
    )
    if (others.length) result.set(run, new Set(others))
  }
  return result
}
