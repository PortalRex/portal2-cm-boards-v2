import melBackground from '@/assets/MelBackground.png'
import portal2Logo from '@/assets/portal2logo.png'
import melLogo from '@/assets/psmcm.png'
import { PORTAL2 } from './selectors'
import type { Catalog } from './types'

// The game the site shows (Score Updates, the map list, Aggregate, Stats, Compare, profiles),
// picked under the logo in the header and saved in this browser. A page's address can name the
// game instead (a ?game= link, a Mel board or map), and then wins: shared links open on their
// game, and the header follows them.

/** Games only: a season belongs to its base game (picked on that game's pages). */
export function baseGame(c: Catalog, id: string | null | undefined): string | null {
  const g = id ? c.games[id] : undefined
  if (!g) return null
  if (g.kind !== 'season') return g.id
  return g.base && c.games[g.base] ? g.base : null
}

/** The game a page's address belongs to, if it names one. */
export function gameFromLocation(c: Catalog, pathname: string, search: string): string | null {
  const param = baseGame(c, new URLSearchParams(search).get('game'))
  if (param) return param
  if (pathname.startsWith('/leaderboard/mel')) return 'mel'
  const custom = pathname.match(/^\/leaderboard\/game\/([^/]+)/)
  if (custom) return baseGame(c, custom[1])
  if (pathname.startsWith('/leaderboard/')) return PORTAL2
  const map = pathname.match(/^\/map\/([^/]+)\//)
  if (map) {
    const g = Object.values(c.games).find((x) => x.modes.includes(map[1]!))
    return g ? baseGame(c, g.id) : null
  }
  return null
}

/** The selected game: the address's, else the saved choice, else Portal 2. */
export const selectedGame = (c: Catalog, fromAddress: string | null, saved: string | null): string =>
  fromAddress ?? baseGame(c, saved) ?? PORTAL2

export interface Branding {
  logo: string
  brand: string
  /** The site-wide background for this game, or null to keep the default one. */
  background: string | null
}

// The site's own branding per game. The games editor can replace each part.
const BUILT_IN: Record<string, Branding> = {
  mel: { logo: melLogo, brand: 'PSM:CM', background: melBackground },
}

export const builtInBranding = (id: string): Branding => ({
  logo: BUILT_IN[id]?.logo ?? portal2Logo,
  brand: BUILT_IN[id]?.brand ?? 'P2CM',
  background: BUILT_IN[id]?.background ?? null,
})

/** The header logo, name and background for a game, from the catalog or the built-in ones. */
export function gameBranding(c: Catalog, id: string): Branding {
  const g = c.games[id]
  const builtIn = builtInBranding(id)
  return {
    logo: g?.logo ?? builtIn.logo,
    brand: g?.shortName ?? builtIn.brand,
    background: g?.background ?? builtIn.background,
  }
}

// A game's aggregated boards (built-in games keep their old addresses).
const BOARD_BASE: Record<string, string> = { portal2: '/leaderboard', mel: '/leaderboard/mel' }

export const gameBoardPath = (game: string, board: string): string =>
  BOARD_BASE[game] ? `${BOARD_BASE[game]}/${board}` : `/leaderboard/game/${game}/${board}`

export const gameBoardsPath = (game: string): string => gameBoardPath(game, 'overall')
