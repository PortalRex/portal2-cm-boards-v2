import { cn } from 'cn'
import type { CSSProperties } from 'react'

// Rank colours from the original board (Portal2Boards public/js/rank.js): a linear RGB blend
// across rank stops, pink for world records, grey past rank 500. The map boards' rank tags show
// this scale (toned down with grey), and every other rank colour follows it so a rank has one
// colour everywhere: on dark backgrounds it's lifted towards white to read (the old site's
// separate bright scale had other hues, a teal 13 where the tag is blue).
const STOPS = [0, 10, 20, 50, 500]
const SCALE = ['#9400d3', '#0000ff', '#006400', '#d67104', '#8b0000']
// The old site's dark-background scale: the profile's rank tiles were tinted with it before they took
// the map tags' colours, and every rank tag is with low-contrast rank colours (Settings).
const SOFT_SCALE = ['#ee82ee', '#add8e6', '#42ff42', '#ffa542', '#ff4242']
export const WR_COLOR = '#d980ff'

// How much white lifts a rank colour for text and bars on dark backgrounds.
const DARK_LIFT = 45
// Rank numbers written out are this much more saturated than the colours (CSS saturate()).
const VIVID = 1.25

type Rgb = [number, number, number]

const hexToRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb
const rgbText = (c: Rgb) => `rgb(${c.map((v) => Math.round(Math.min(255, Math.max(0, v)))).join(', ')})`
const parseRgb = (color: string): Rgb =>
  color.startsWith('#') ? hexToRgb(color) : (color.match(/\d+/g)!.slice(0, 3).map(Number) as Rgb)

// Oklab, for the lift towards white as CSS color-mix(in oklab, ...) does it.
const toLinear = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const fromLinear = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)
function toOklab(c: Rgb): Rgb {
  const [r, g, b] = c.map(toLinear) as Rgb
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
function fromOklab([L, A, B]: Rgb): Rgb {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(fromLinear) as Rgb
}
/** `color` with `white` parts of white in 100, mixed in Oklab. */
const lift = (color: Rgb, white: number): Rgb =>
  fromOklab(toOklab(color).map((v, i) => v + ((i === 0 ? 1 : 0) - v) * (white / 100)) as Rgb)
/** The colour CSS saturate(amount) gives (its sRGB matrix). */
function saturate([r, g, b]: Rgb, amount: number): Rgb {
  const s = amount
  return [
    (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b,
    (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b,
    (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b,
  ]
}

function blend(rank: number, scale = SCALE) {
  const i = Math.max(0, STOPS.findIndex((stop) => rank <= stop) - 1)
  const lo = STOPS[i]!
  const hi = STOPS[i + 1]!
  const t = (rank - lo) / (hi - lo)
  const a = hexToRgb(scale[i]!)
  const b = hexToRgb(scale[i + 1]!)
  return `rgb(${a.map((v, k) => Math.round(v + (b[k]! - v) * t)).join(', ')})`
}

/** A rank's colour (as on light backgrounds and the map boards' tags). */
export function rankTextColor(rank: number | null | undefined): string | null {
  if (rank == null) return null
  if (rank === 1) return WR_COLOR
  if (rank > 500) return '#888888'
  return blend(rank)
}

export type RankVars = CSSProperties & {
  '--rank-color': string
  '--rank-color-dark': string
  '--rank-color-soft': string
  /** The rank colours for numbers written out (rank-tint), VIVID times as saturated. */
  '--rank-text'?: string
  '--rank-text-dark'?: string
}

/**
 * CSS variables carrying a rank's colour for both themes (see the `rank-tint` utility): as it is on
 * light backgrounds, lifted towards white on dark ones (a world record's pink as it is). The soft
 * colour is the rank's on the old site's dark scale, for low-contrast rank tags (`rank-fill`,
 * `rank-tile`).
 */
export function rankVars(rank: number | null | undefined): RankVars | undefined {
  if (rank == null) return undefined
  const r = Math.round(rank)
  const color = rankTextColor(r)!
  const dark = r <= 1 ? color : `color-mix(in oklab, ${color} ${100 - DARK_LIFT}%, white)`
  const soft = r <= 1 ? color : r > 500 ? '#888888' : blend(r, SOFT_SCALE)
  // Worked out here rather than with a CSS filter on each number: long lists have hundreds.
  const base = parseRgb(color)
  return {
    '--rank-color': color,
    '--rank-color-dark': dark,
    '--rank-color-soft': soft,
    '--rank-text': rgbText(saturate(base, VIVID)),
    '--rank-text-dark': rgbText(saturate(r <= 1 ? base : lift(base, DARK_LIFT), VIVID)),
  }
}

/**
 * The profile's rank tiles: the same colours as the map boards and Score Updates (`rankVars`), so a
 * rank looks the same everywhere. A world record is the trophy's own colour. (The old site used a
 * separate rainbow scale here, which showed the same rank in two colours.)
 */
export function rankTileVars(rank: number | null | undefined): RankVars | undefined {
  if (rank == null) return undefined
  if (Math.round(rank) <= 1) {
    return {
      '--rank-color': 'var(--trophy)',
      '--rank-color-dark': 'var(--trophy)',
      '--rank-color-soft': 'var(--trophy)',
    }
  }
  return rankVars(rank)
}

/** A rank tag's shape without a size, for tags that need their own (the map board's). */
export const RANK_TAG_BASE = 'num inline-flex items-center justify-center rounded-[2px]'

/** A rank tag's shape, shared by the profile summary's tiles and RankChange. */
export const RANK_TAG = cn(RANK_TAG_BASE, 'h-[30px] w-[60px] text-base upto800:w-11')
