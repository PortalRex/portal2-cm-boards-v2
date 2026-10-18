/**
 * When the demo's ticks give a time 0.01 above the run's (or the run's was rounded up rather than
 * cut down), that's how the player's setup handles the timer, not a different run: said so here so
 * nobody reports it. The demo time is ticks ÷ 60 cut down to the hundredth.
 */
export function timerNote(score: number | null | undefined, ticks: number | null) {
  if (ticks == null || score == null) return null
  const demo = Math.floor((ticks * 5) / 3)
  const rounded = Math.round((ticks * 5) / 3)
  const low = score === demo - 1
  const up = score !== demo && score === rounded
  return low || up ? { ticks, demo } : null
}
