import { getMap, mapPath, mapsForGame } from './selectors'
import type { Catalog, Game, MapInfo } from './types'

// Seasons are a choice on their base game's pages (?season=<key>) rather than games of their
// own. A season is still its own game in the catalog: its boards are "<season>-<mode>" and its
// maps copies of the base game's (`sourceId`), so these helpers translate between the two.

const startOf = (g: Game) => (g.startsAt ? new Date(`${g.startsAt}Z`).getTime() : 0)
const endOf = (g: Game) => (g.endsAt ? new Date(`${g.endsAt}Z`).getTime() : Infinity)

export const isSeason = (c: Catalog, key: string | null | undefined): boolean =>
  Boolean(key && c.games[key]?.kind === 'season')

/** Running now. */
export const isLive = (g: Game | null | undefined, now = Date.now()): boolean =>
  Boolean(g?.startsAt) && startOf(g!) <= now && endOf(g!) > now

/** A game's seasons, newest first. Hidden ones only reach staff (the catalog leaves them out). */
export const seasonsOf = (c: Catalog, base: string): Game[] =>
  Object.values(c.games)
    .filter((g) => g.kind === 'season' && g.base === base)
    .sort((a, b) => startOf(b) - startOf(a))

/** The season running now (else the latest one) of any game, for "Current season" links. */
export function currentSeason(c: Catalog, base: string | null = null, now = Date.now()): Game | null {
  const seasons = Object.values(c.games).filter(
    (g) => g.kind === 'season' && !g.hidden && (!base || g.base === base),
  )
  const byStart = (a: Game, b: Game) => startOf(b) - startOf(a)
  return seasons.filter((g) => isLive(g, now)).sort(byStart)[0] ?? seasons.sort(byStart)[0] ?? null
}

/** The season picked with ?season= on a page of `base`, if it's one of that game's seasons. */
export function seasonFor(c: Catalog, base: string, picked: string | null | undefined): string | null {
  if (!picked) return null
  const g = c.games[picked]
  return g?.kind === 'season' && g.base === base ? picked : null
}

/** A board key without its game prefix: "season-1-sp" -> "sp" (built-in games' keys are bare). */
export const modeOf = (game: string, board: string): string =>
  board.startsWith(`${game}-`) ? board.slice(game.length + 1) : board

/** The season's board for one of its base game's boards ("overall" stays), or null if it has none. */
export function seasonBoard(c: Catalog, season: string, base: string, baseBoard: string): string | null {
  if (baseBoard === 'overall') return 'overall'
  const key = `${season}-${modeOf(base, baseBoard)}`
  return c.games[season]?.modes.includes(key) ? key : null
}

/** The base game's board for one of the season's ("season-1-sp" -> "sp", or "<game>-sp"). */
export function baseBoardOf(c: Catalog, season: string, board: string): string {
  const base = c.games[season]?.base
  if (!base || board === 'overall') return board
  const mode = modeOf(season, board)
  return c.games[base]?.modes.find((m) => modeOf(base, m) === mode) ?? mode
}

/** The season's copy of a base map. */
export const seasonMap = (c: Catalog, season: string, baseMapId: string | number): MapInfo | null =>
  mapsForGame(c, season).find((m) => m.sourceId === String(baseMapId)) ?? null

/** The base map of a season's copy. */
export function baseMapOf(c: Catalog, map: MapInfo | null | undefined): MapInfo | null {
  const base = map ? c.games[map.game]?.base : null
  return map?.sourceId && base ? (getMap(c, map.sourceId, base) ?? null) : null
}

/** Adds (or with null removes) ?season= on a path, keeping its other parameters. */
export function withSeason(path: string, season: string | null | undefined): string {
  const [p, q = ''] = path.split('?')
  const params = new URLSearchParams(q)
  if (season) params.set('season', season)
  else params.delete('season')
  const s = params.toString()
  return s ? `${p}?${s}` : p!
}

/** A map's page: a season's copy opens as its base map with the season picked. */
export function mapLink(c: Catalog, map: MapInfo): string {
  const base = baseMapOf(c, map)
  return base ? withSeason(mapPath(base), map.game) : mapPath(map)
}

/** Picker options: All-time, then the seasons (live ones tagged, hidden ones marked for staff). */
export function seasonOptions(
  c: Catalog,
  base: string,
  now = Date.now(),
): { value: string; label: string }[] {
  const day = (ts: string) => ts.slice(0, 10)
  return [
    { value: '', label: 'All-time' },
    ...seasonsOf(c, base).map((g) => ({
      value: g.id,
      label: `${g.label}${
        isLive(g, now) ? ' · Live' : g.endsAt && endOf(g) < now ? ` · ended ${day(g.endsAt)}` : ''
      }${g.hidden ? ' (hidden)' : ''}`,
    })),
  ]
}
