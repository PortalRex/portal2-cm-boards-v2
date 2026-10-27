// Times, deltas, dates and points as the boards show them.

export type Timestamp = string | number | Date

/**
 * The API sends UTC timestamps without a zone suffix ("2026-10-12T15:59:13"); those are read
 * as UTC rather than local time.
 */
export function parseTimestamp(timestamp: Timestamp): Date
export function parseTimestamp(timestamp: Timestamp | null | undefined): Date | null
export function parseTimestamp(timestamp: Timestamp | null | undefined): Date | null {
  if (timestamp == null) return null
  if (timestamp instanceof Date || typeof timestamp === 'number') return new Date(timestamp)
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(timestamp) ? timestamp : `${timestamp}Z`)
}

/** Scores are integer centiseconds: 2243 -> "22.43", 11783 -> "1:57.83". */
export function formatScore(cs: number | null | undefined): string {
  if (cs == null) return ''
  const negative = cs < 0
  const abs = Math.abs(Math.round(cs))
  const minutes = Math.floor(abs / 6000)
  const seconds = Math.floor((abs % 6000) / 100)
  const hh = String(abs % 100).padStart(2, '0')
  const text = minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}.${hh}` : `${seconds}.${hh}`
  return negative ? `-${text}` : text
}

/** Seconds to the millisecond, with minutes from a minute up (mtrigger splits): 75.5 -> "1:15.500". */
export function formatSeconds(seconds: number): string {
  const ms = Math.round(seconds * 1000)
  const minutes = Math.floor(ms / 60000)
  const rest = ((ms % 60000) / 1000).toFixed(3)
  return minutes > 0 ? `${minutes}:${rest.padStart(6, '0')}` : rest
}

/** Signed delta: 12 -> "+0.12", -42 -> "-0.42", 0 -> "±0.00". */
export function formatDelta(cs: number | null | undefined, suffix = ''): string {
  if (cs == null) return ''
  const sign = cs > 0 ? '+' : cs < 0 ? '-' : '±'
  return `${sign}${formatScore(Math.abs(cs))}${suffix}`
}

/** Long aggregated times (hours of play): 319851 -> "53:18.51". */
export function formatLongScore(cs: number | null | undefined): string {
  return formatScore(cs)
}

const UNITS: [string, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

export function timeAgo(timestamp: Timestamp | null | undefined, now = Date.now()): string {
  if (!timestamp) return ''
  const seconds = Math.max(0, (now - parseTimestamp(timestamp).getTime()) / 1000)
  for (const [unit, size] of UNITS) {
    if (seconds >= size) {
      const n = Math.floor(seconds / size)
      return `${n} ${unit}${n === 1 ? '' : 's'} ago`
    }
  }
  return 'just now'
}

const isPlainDate = (t: Timestamp): t is string => typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t)
const pad = (n: number) => String(n).padStart(2, '0')

/** The viewer's local date, "2026-10-13". Plain dates have no zone and are shown as they are. */
export function formatDate(timestamp: Timestamp | null | undefined): string {
  if (!timestamp) return ''
  if (isPlainDate(timestamp)) return timestamp
  const d = parseTimestamp(timestamp)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The date and time in the viewer's zone, as the old boards showed it: "Tue, 2026-10-13, 19:03:55". */
export function formatDateTime(timestamp: Timestamp | null | undefined): string {
  if (!timestamp) return ''
  if (isPlainDate(timestamp)) return timestamp
  const d = parseTimestamp(timestamp)
  return `${WEEKDAYS[d.getDay()]}, ${formatDate(d)}, ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const SUFFIXES: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' }

export function ordinalSuffix(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return 'th'
  return SUFFIXES[n % 10] ?? 'th'
}

export function formatPoints(points: number | null | undefined): string {
  if (points == null) return ''
  return Math.round(points).toString()
}
