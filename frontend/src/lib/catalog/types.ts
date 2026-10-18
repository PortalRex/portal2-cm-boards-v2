// The game catalog. Raw types match GET /catalog (server/src/controllers/catalog.rs) exactly; the
// built types are what the site works with.

export interface CatalogCategoryRaw {
  id: number
  name: string
}

export interface CatalogMapRaw {
  steam_id: string
  name: string
  bsp_name: string | null
  default_cat_id: number | null
  source_map: string | null
  sort_order: number
  image_version: number | null
  categories: CatalogCategoryRaw[]
  links: string[]
}

export interface CatalogChapterRaw {
  id: number
  name: string | null
  game_mode: string
  is_multiplayer: boolean
  sort_order: number
  maps: CatalogMapRaw[]
}

export interface CatalogGameRaw {
  id: number
  name: string
  slug: string
  /** "game" or "season". */
  kind: string
  base_game_id: number | null
  /** UTC, without a zone ("2026-10-01T00:00:00"). */
  starts_at: string | null
  ends_at: string | null
  sort_order: number
  hidden: boolean
  short_name: string | null
  logo_version: number | null
  background_version: number | null
  /** The game's own board names by chapter game_mode ({ "sp": "No hair" }). */
  mode_names: Record<string, string>
  chapters: CatalogChapterRaw[]
}

export type CatalogRaw = CatalogGameRaw[]

/**
 * A game or season. `id` is its key on the site: "portal2" and "mel" for games 1 and 2 (their
 * historic names), the slug for others.
 */
export interface Game {
  id: string
  /** games.id in the database (the API's game_id). */
  dbId: number
  slug: string | null
  label: string
  kind: string
  hidden: boolean
  /** A season's base game key. */
  base: string | null
  startsAt: string | null
  endsAt: string | null
  /** The game's folder name, for demo checks: "portal2" or "portal_stories" (Mel and its seasons). */
  gameDir: string
  /** Board keys, single player first: "sp"/"coop" for Portal 2, "<slug>-<game_mode>" for other games. */
  modes: string[]
  /** Header branding from the games editor; null = the site's built-in ones. */
  shortName: string | null
  logo: string | null
  background: string | null
}

export interface MapCategory {
  id: number
  name: string
}

export interface MapInfo {
  /** Steam leaderboard id for Portal 2, board id (1-44) for Mel, any string for other games. */
  id: string
  title: string
  /** Board key. */
  mode: string
  /** Game key. */
  game: string
  bsp: string | null
  chapter: string
  chapterNumber: number
  image: string | null
  /** A season's copy points at its base map. */
  sourceId: string | null
  defaultCategory: number | null
  categories: MapCategory[]
}

export interface Chapter {
  name: string
  number: number
  /** chapters.id; built-in chapters work it out (see chapterDbId). */
  dbId?: number
  mode: string
  game: string
  multiplayer: boolean
  maps: MapInfo[]
}

/** Everything the site knows about games and maps, built once per catalog response. */
export interface Catalog {
  /** Games and seasons by key, in catalog order. */
  games: Record<string, Game>
  /** Board key -> game key. */
  modeGame: Record<string, string>
  multiplayerModes: ReadonlySet<string>
  /** Board key -> display name. */
  modeLabels: Record<string, string>
  chaptersByMode: Record<string, Chapter[]>
  /** "<game>:<map id>" -> map. */
  maps: ReadonlyMap<string, MapInfo>
  /** True when built from the server's catalog, false for the built-in Portal 2 / Mel data. */
  fromServer: boolean
}
