import type { CoopHalf } from '@/types/runs'

/**
 * A pending co-op run's status, naming whose demos it's waiting for: every co-op run needs a demo
 * from each player, even when only one of them improved. Null when neither half is missing one
 * (it's pending for another reason, such as a staff review).
 */
export function waitingForDemos(halves: CoopHalf[]): string | null {
  const missing = halves.filter((h) => h.demoId == null).map((h) => h.player?.name || 'their partner')
  if (missing.length === 0) return null
  if (missing.length === halves.length) return 'Pending: waiting for both players’ demos'
  return `Pending: waiting for ${missing.join(' and ')}’s demo`
}
