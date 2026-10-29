import { parseTimestamp, type Timestamp } from './format'

const HOUR_MS = 3600 * 1000

// The old boards' scale for how long ago a run was set: bright green when new, darker green by a
// day, yellow by two weeks and orange by two months (--age-0 to --age-3, one shade per theme).
const STOPS_H = [0, 24, 14 * 24, 60 * 24]

/**
 * The colour a run's "… ago" is shown in, blending between the scale's shades; undefined once it's
 * over two months old (it keeps its usual grey).
 */
export function ageColor(timestamp: Timestamp | null | undefined, now = Date.now()): string | undefined {
  const t = parseTimestamp(timestamp)
  if (!t) return undefined
  const hours = Math.max(0, (now - t.getTime()) / HOUR_MS)
  const i = STOPS_H.findIndex((h, n) => n > 0 && hours <= h)
  if (i < 0) return undefined
  const along = Math.round(((hours - STOPS_H[i - 1]!) / (STOPS_H[i]! - STOPS_H[i - 1]!)) * 100)
  return `color-mix(in srgb, var(--age-${i}) ${along}%, var(--age-${i - 1}))`
}
