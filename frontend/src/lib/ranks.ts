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

const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

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
  return { '--rank-color': color, '--rank-color-dark': dark, '--rank-color-soft': soft }
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
