// Buckets the per-day submission counts from /graph for the Daily Activity chart.
//   month: one point per day of a calendar month
//   year:  one point per week (starting Monday) of a calendar year
//   all:   one point per month over the whole history
// `offset` steps back from the current month / year (0 = current). Dates are UTC.
const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const utc = (date) => Date.parse(`${date}T00:00:00Z`);
const fmt = (t, opts) => new Date(t).toLocaleDateString(undefined, { timeZone: "UTC", ...opts }).toUpperCase();

export const ACTIVITY_VIEWS = [
  { value: "month", label: "Month", title: "Daily Activity" },
  { value: "year", label: "Year", title: "Weekly Activity" },
  { value: "all", label: "All time", title: "Monthly Activity" },
];

export function activityWindow(days, view, offset, now = Date.now()) {
  const counts = new Map(days.map((d) => [d.date, d.count]));
  const first = days.length ? utc(days[0].date) : now;
  const today = utc(iso(now));
  const nowDate = new Date(today);

  if (view === "month") {
    const start = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() - offset, 1);
    const next = new Date(start);
    const end = Math.min(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 1) - DAY, today);
    const points = [];
    for (let t = start; t <= end; t += DAY) points.push({ label: fmt(t, { day: "2-digit", month: "short" }), count: counts.get(iso(t)) || 0 });
    return { points, label: fmt(start, { month: "long", year: "numeric" }), hasPrev: start > first, hasNext: offset > 0 };
  }

  if (view === "year") {
    const year = nowDate.getUTCFullYear() - offset;
    const start = Date.UTC(year, 0, 1);
    const end = Math.min(Date.UTC(year + 1, 0, 1) - DAY, today);
    // Weeks start on Monday; the first one may begin in December of the year before.
    let week = start - ((new Date(start).getUTCDay() + 6) % 7) * DAY;
    const points = [];
    for (; week <= end; week += 7 * DAY) {
      let count = 0;
      for (let t = Math.max(week, start); t < week + 7 * DAY && t <= end; t += DAY) count += counts.get(iso(t)) || 0;
      points.push({ label: fmt(Math.max(week, start), { day: "2-digit", month: "short" }), count });
    }
    return { points, label: String(year), hasPrev: start > first, hasNext: offset > 0 };
  }

  const byMonth = new Map();
  days.forEach((d) => byMonth.set(d.date.slice(0, 7), (byMonth.get(d.date.slice(0, 7)) || 0) + d.count));
  const points = [];
  const f = new Date(first);
  for (let t = Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), 1); t <= today; ) {
    points.push({ label: fmt(t, { month: "short", year: "numeric" }), count: byMonth.get(iso(t).slice(0, 7)) || 0 });
    const d = new Date(t);
    t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  return { points, label: points.length ? `${points[0].label} – ${points[points.length - 1].label}` : "", hasPrev: false, hasNext: false };
}
