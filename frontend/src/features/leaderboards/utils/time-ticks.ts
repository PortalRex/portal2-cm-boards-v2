const DAY_MS = 24 * 3600 * 1000
export const YEAR_MS = 365.25 * DAY_MS
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Axis ticks for [from, to] and their labels: years, quarters, months, or days as the span
 * shrinks, thinned to at most `max` so labels never overlap.
 */
export function timeTicks(
  from: number,
  to: number,
  max = 7,
): { ticks: number[]; label: (t: number) => string } {
  const span = to - from
  if (span < 75 * DAY_MS) {
    const n = 4
    const ticks = Array.from({ length: n }, (_, i) => from + (span * (i + 0.5)) / n)
    const day = (t: number) => `${MONTHS_SHORT[new Date(t).getMonth()]} ${new Date(t).getDate()}`
    // Within a couple of days (a new season's first records): times of day, with the day when the
    // ticks fall on different days.
    if (span < 2 * DAY_MS) {
      const time = (t: number) =>
        new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      const oneDay = new Set(ticks.map((t) => new Date(t).toDateString())).size === 1
      return { ticks, label: oneDay ? time : (t) => `${day(t)} ${time(t)}` }
    }
    return { ticks, label: day }
  }
  const months = span < 0.75 * YEAR_MS ? 1 : span < 2.5 * YEAR_MS ? 3 : 12
  const ticks: number[] = []
  const d = new Date(from)
  let cur = new Date(d.getFullYear(), Math.floor(d.getMonth() / months) * months + months, 1)
  while (cur.getTime() <= to) {
    ticks.push(cur.getTime())
    cur = new Date(cur.getFullYear(), cur.getMonth() + months, 1)
  }
  const step = Math.max(1, Math.ceil(ticks.length / max))
  const label =
    months === 12
      ? (t: number) => String(new Date(t).getFullYear())
      : (t: number) => `${MONTHS_SHORT[new Date(t).getMonth()]} ${new Date(t).getFullYear()}`
  return { ticks: ticks.filter((_, i) => i % step === 0), label }
}
