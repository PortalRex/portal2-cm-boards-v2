/**
 * Points a rank is worth on a map (the board's formula): 200 for a world record, falling off
 * quadratically to 1 at rank 200, none after that.
 */
export function pointsForRank(rank: number): number {
  if (rank > 200) return 0
  return Math.max(1, Math.round(((200 - (rank - 1)) ** 2 / 200) * 10) / 10)
}
