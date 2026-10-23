import type { Catalog, Chapter, Game, MapInfo } from './types'

// Pure lookups over a built catalog (the legacy site's data/maps.js exports, without the
// mutable globals). Board keys are "sp", "coop", "story", "advanced" or "<slug>-<game_mode>".

export const PORTAL2 = 'portal2'
export const MEL = 'mel'

/** The game a board belongs to. */
export const gameForMode = (c: Catalog, mode: string): string =>
  c.modeGame[mode] ?? (mode === 'story' || mode === 'advanced' ? MEL : PORTAL2)

export const isMultiplayerMode = (c: Catalog, mode: string): boolean => c.multiplayerModes.has(mode)

export const modeLabel = (c: Catalog, mode: string): string => c.modeLabels[mode] ?? mode

/** A board's chapters (Portal 2's single player ones for an unknown board, as legacy). */
export const chaptersFor = (c: Catalog, mode: string): Chapter[] =>
  c.chaptersByMode[mode] ?? c.chaptersByMode.sp ?? []

export const mapsForMode = (c: Catalog, mode: string): MapInfo[] =>
  chaptersFor(c, mode).flatMap((ch) => ch.maps)

/** Every map of a game, in board and chapter order. */
export const mapsForGame = (c: Catalog, game: string): MapInfo[] =>
  (c.games[game]?.modes ?? []).flatMap((m) => mapsForMode(c, m))

export const getMap = (c: Catalog, id: string | number, game: string = PORTAL2): MapInfo | undefined =>
  c.maps.get(`${game}:${id}`)

/** A map by id in any game (map ids are unique across games). */
export function findMap(c: Catalog, id: string | number): MapInfo | undefined {
  const wanted = String(id)
  for (const m of c.maps.values()) if (m.id === wanted) return m
  return undefined
}

/** The map's page. */
export const mapPath = (map: Pick<MapInfo, 'mode' | 'id'>): string => `/map/${map.mode}/${map.id}`

/** Portal 2 chapters' ids in the database: co-op courses are 1-6, single player chapters 7-15. */
export const chapterDbId = (chapter: Pick<Chapter, 'dbId' | 'mode' | 'number'>): number =>
  chapter.dbId ?? (chapter.mode === 'coop' ? chapter.number : chapter.number + 6)

/** Portal 2's chapters: single player, then co-op. */
export const p2Chapters = (c: Catalog): Chapter[] => [
  ...chaptersFor(c, 'sp'),
  ...(c.chaptersByMode.coop ?? []),
]

export const p2ChapterByDbId = (c: Catalog, id: string | number): Chapter | undefined =>
  p2Chapters(c).find((ch) => chapterDbId(ch) === Number(id))

/** The games that can be picked in the banner: kind "game", not hidden. */
export const pickableGames = (c: Catalog): Game[] =>
  Object.values(c.games).filter((g) => g.kind === 'game' && !g.hidden)

/**
 * The API's game_id parameter for a game: Portal 2 sends none (the server's default), every
 * other game its games.id.
 */
export function gameIdParam(c: Catalog, game: string | null | undefined): { game_id?: number } {
  if (!game || game === PORTAL2) return {}
  const dbId = c.games[game]?.dbId
  return dbId != null ? { game_id: dbId } : {}
}
