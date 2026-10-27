// Calendar maths on days written YYYY-MM-DD, in UTC so no time zone shifts a day. Months are 0-11.

/** A month: its year and month (0-11). */
export interface YearMonth {
  year: number
  month: number
}

/** The month a day is in. */
export const monthOf = (day: string): YearMonth => ({
  year: Number(day.slice(0, 4)),
  month: Number(day.slice(5, 7)) - 1,
})

/** The month `by` months after `ym` (before, when negative). */
export function addMonths({ year, month }: YearMonth, by: number): YearMonth {
  const n = year * 12 + month + by
  return { year: Math.floor(n / 12), month: ((n % 12) + 12) % 12 }
}

/** A month's first day, YYYY-MM-01. */
export const firstDay = ({ year, month }: YearMonth): string =>
  new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)

/** A month's last day. */
export const lastDay = ({ year, month }: YearMonth): string =>
  new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10)

/** Six weeks of days covering the month, Monday first, each marked whether it's in the month. */
export function monthGrid({ year, month }: YearMonth): { day: string; inMonth: boolean }[] {
  const lead = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(Date.UTC(year, month, 1 - lead + i))
    return { day: d.toISOString().slice(0, 10), inMonth: d.getUTCMonth() === month }
  })
}

/** Today where the viewer is, as YYYY-MM-DD. */
export const today = (): string => new Date().toLocaleDateString('en-CA')
