import type { Chapter } from '@/lib/catalog'
import type { SideScore } from '../api/compare'

export interface CompareSummary {
  /** Maps each player is faster on (a time beats no time). */
  left: number
  right: number
  ties: number
  onlyLeft: number
  onlyRight: number
  /** Total times over the maps both have a time on. */
  leftTotal: number
  rightTotal: number
  shared: number
}

/** Who is faster on how many of the board's maps. */
export function compareSummary(
  chapters: Chapter[],
  left: Record<string, SideScore>,
  right: Record<string, SideScore>,
): CompareSummary {
  const out = {
    left: 0,
    right: 0,
    ties: 0,
    onlyLeft: 0,
    onlyRight: 0,
    leftTotal: 0,
    rightTotal: 0,
    shared: 0,
  }
  for (const m of chapters.flatMap((c) => c.maps)) {
    const l = left[m.id]
    const r = right[m.id]
    if (l && r) {
      out.shared++
      out.leftTotal += l.score
      out.rightTotal += r.score
      if (l.score < r.score) out.left++
      else if (r.score < l.score) out.right++
      else out.ties++
    } else if (l) {
      out.onlyLeft++
      out.left++
    } else if (r) {
      out.onlyRight++
      out.right++
    }
  }
  return out
}
