import { modeLabel, type Catalog } from '@/lib/catalog'

export const number = (n: number) => Number(n).toLocaleString('en-US')

export const days = (d: number) => `${number(Math.round(d))} day${Math.round(d) === 1 ? '' : 's'}`

/**
 * How long a record stood, from its start to its end (both as the server sends them): seconds,
 * minutes, hours and minutes, or days, as fits. Some records fell within minutes.
 */
export function stoodFor(start: string, end: string): string {
  const seconds = Math.max(0, Math.round((Date.parse(`${end}Z`) - Date.parse(`${start}Z`)) / 1000))
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  if (minutes < 24 * 60)
    return minutes % 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes / 60} h`
  return days(seconds / 86400)
}

/** A board's name: "Overall", or the mode's label. */
export const boardLabel = (c: Catalog, key: string) => (key === 'overall' ? 'Overall' : modeLabel(c, key))

/** A board key from the address, if the game has it (else the default). */
export const pick = (value: string | undefined, allowed: string[], fallback: string) =>
  value && allowed.includes(value) ? value : fallback

/** A steady colour per player. */
export const hue = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)

/** The History page's views (?view=). */
export const HISTORY_VIEWS = [
  { value: 'longest', label: 'Longest lasting' },
  { value: 'shortest', label: 'Shortest lasting' },
  { value: 'domination', label: 'Longest domination' },
  { value: 'improvements', label: 'Biggest improvements' },
  { value: 'days', label: 'Days holding' },
]
