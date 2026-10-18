// Buckets the per-day submission counts from /graph for the activity chart.
//   month: one point per day of a calendar month
//   year:  one point per week (starting Monday) of a calendar year
//   all:   one point per month over the whole history
// `offset` steps back from the current month / year (0 = current). Dates are the viewer's own
// days (the server counts in their time zone); today is still going, so its point is `partial`.

export interface ActivityDay {
  /** YYYY-MM-DD */
  date: string
  count: number
}

export type ActivityView = 'month' | 'year' | 'all'

export interface ActivityPoint {
  label: string
  count: number
  partial?: boolean
}

export interface ActivityWindow {
  points: ActivityPoint[]
  label: string
  hasPrev: boolean
  hasNext: boolean
}

export const ACTIVITY_VIEWS: { value: ActivityView; label: string; title: string }[] = [
  { value: 'month', label: 'Month', title: 'Daily Activity' },
  { value: 'year', label: 'Year', title: 'Weekly Activity' },
  { value: 'all', label: 'All time', title: 'Monthly Activity' },
]

const DAY = 86400000
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const utc = (date: string) => Date.parse(`${date}T00:00:00Z`)
const fmt = (t: number, opts: Intl.DateTimeFormatOptions) =>
  new Date(t).toLocaleDateString(undefined, { timeZone: 'UTC', ...opts }).toUpperCase()
const pad = (n: number) => String(n).padStart(2, '0')
// The viewer's date today, as a UTC midnight like the day keys.
const localToday = (now: number) => {
  const d = new Date(now)
  return utc(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
}

export function activityWindow(
  days: ActivityDay[],
  view: ActivityView,
  offset: number,
  now = Date.now(),
): ActivityWindow {
  const counts = new Map(days.map((d) => [d.date, d.count]))
  const first = days[0] ? utc(days[0].date) : now
  const today = localToday(now)
  const nowDate = new Date(today)

  if (view === 'month') {
    const start = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() - offset, 1)
    const next = new Date(start)
    const end = Math.min(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 1) - DAY, today)
    const points: ActivityPoint[] = []
    for (let t = start; t <= end; t += DAY) {
      points.push({
        label: fmt(t, { day: '2-digit', month: 'short' }),
        count: counts.get(iso(t)) ?? 0,
        partial: t === today,
      })
    }
    return {
      points,
      label: fmt(start, { month: 'long', year: 'numeric' }),
      hasPrev: start > first,
      hasNext: offset > 0,
    }
  }

  if (view === 'year') {
    const year = nowDate.getUTCFullYear() - offset
    const start = Date.UTC(year, 0, 1)
    const end = Math.min(Date.UTC(year + 1, 0, 1) - DAY, today)
    // Weeks start on Monday; the first one may begin in December of the year before.
    let week = start - ((new Date(start).getUTCDay() + 6) % 7) * DAY
    const points: ActivityPoint[] = []
    for (; week <= end; week += 7 * DAY) {
      let count = 0
      for (let t = Math.max(week, start); t < week + 7 * DAY && t <= end; t += DAY)
        count += counts.get(iso(t)) ?? 0
      points.push({ label: fmt(Math.max(week, start), { day: '2-digit', month: 'short' }), count })
    }
    return { points, label: String(year), hasPrev: start > first, hasNext: offset > 0 }
  }

  const byMonth = new Map<string, number>()
  for (const d of days) byMonth.set(d.date.slice(0, 7), (byMonth.get(d.date.slice(0, 7)) ?? 0) + d.count)
  const points: ActivityPoint[] = []
  const f = new Date(first)
  for (let t = Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), 1); t <= today;) {
    points.push({
      label: fmt(t, { month: 'short', year: 'numeric' }),
      count: byMonth.get(iso(t).slice(0, 7)) ?? 0,
    })
    const d = new Date(t)
    t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
  }
  const firstLabel = points[0]?.label
  const lastLabel = points[points.length - 1]?.label
  return {
    points,
    label: firstLabel ? `${firstLabel} – ${lastLabel}` : '',
    hasPrev: false,
    hasNext: false,
  }
}
