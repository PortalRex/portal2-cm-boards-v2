import type { Run } from '@/types/runs'

/** One player's improvement from a co-op run (who set a PB with it). */
export interface CoopPb {
  profileNumber: string
  preRank: number | null
  postRank: number | null
  scoreDelta: number | null
}

export type ScoreUpdate = Run & { pbs: CoopPb[] | null }

/**
 * Both halves of a co-op run come as separate rows when both players set a PB with it; they're
 * shown as one row (where the newer half was) with `pbs` listing each player's improvement.
 */
export function mergeCoopHalves(runs: Run[]): ScoreUpdate[] {
  const byRun = new Map<string, ScoreUpdate>()
  const out: ScoreUpdate[] = []
  for (const r of runs) {
    const pb: CoopPb = {
      profileNumber: r.submitter,
      preRank: r.preRank,
      postRank: r.postRank,
      scoreDelta: r.scoreDelta,
    }
    const key = r.coopId != null ? `${r.game}-${r.coopId}` : null
    const merged = key ? byRun.get(key) : undefined
    if (merged) {
      merged.pbs!.push(pb)
      continue
    }
    const entry: ScoreUpdate = { ...r, pbs: r.coopId != null ? [pb] : null }
    if (key) byRun.set(key, entry)
    out.push(entry)
  }
  return out
}
