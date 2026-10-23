import { apiUrl } from '@/lib/api-client'
import { env } from '@/config/env'
import { BSP_NAMES } from './bsp-names'
import { CHAMBER_IMAGES, MEL_IMAGES } from './builtin-images'
import {
  COOP_CHAPTERS,
  MEL_ADVANCED_CHAPTERS,
  MEL_STORY_CHAPTERS,
  SP_CHAPTERS,
  type BuiltInChapter,
} from './builtin-chapters'
import type { Catalog, CatalogGameRaw, CatalogRaw, Chapter, Game, MapInfo } from './types'

// Games 1 and 2 keep their historic keys and board names; other games use their link name, and
// their boards are "<slug>-<game_mode>" (e.g. "season-1-sp").
const BUILTIN_KEYS: Record<number, string> = { 1: 'portal2', 2: 'mel' }

const BASE_MODE_LABELS: Record<string, string> = {
  sp: 'Singleplayer',
  coop: 'Cooperative',
  story: 'Story Mode',
  advanced: 'Advanced Mode',
}

const titleCase = (s: string) => s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

/** A game's key on the site. */
export const gameKey = (game: Pick<CatalogGameRaw, 'id' | 'slug'>): string =>
  BUILTIN_KEYS[game.id] ?? game.slug

/** A board's name when its game hasn't renamed it (games editor, "Board names"). */
export const defaultModeLabel = (mode: string): string => BASE_MODE_LABELS[mode] ?? titleCase(mode)

// --- built-in Portal 2 and Mel ----------------------------------------------------------

const BUILTIN_GAMES: Record<string, Game> = {
  portal2: {
    id: 'portal2',
    dbId: 1,
    slug: null,
    label: 'Portal 2',
    kind: 'game',
    hidden: false,
    base: null,
    startsAt: null,
    endsAt: null,
    gameDir: 'portal2',
    modes: ['sp', 'coop'],
    shortName: null,
    logo: null,
    background: null,
  },
  mel: {
    id: 'mel',
    dbId: env.VITE_MEL_GAME_ID,
    slug: null,
    label: 'Portal Stories: Mel',
    kind: 'game',
    hidden: false,
    base: null,
    startsAt: null,
    endsAt: null,
    gameDir: 'portal_stories',
    modes: ['story', 'advanced'],
    shortName: null,
    logo: null,
    background: null,
  },
}

const BUILTIN_MODE_GAME: Record<string, string> = {
  sp: 'portal2',
  coop: 'portal2',
  story: 'mel',
  advanced: 'mel',
}

function builtInChapters(chapters: BuiltInChapter[], mode: string): Chapter[] {
  const game = BUILTIN_MODE_GAME[mode]!
  return chapters.map((chapter) => ({
    name: chapter.name,
    number: chapter.number,
    mode,
    game,
    multiplayer: mode === 'coop',
    maps: chapter.maps.map(([id, title, bsp]) => ({
      id,
      title,
      mode,
      game,
      bsp: bsp ?? BSP_NAMES[id] ?? null,
      chapter: chapter.name,
      chapterNumber: chapter.number,
      image: (game === 'mel' ? MEL_IMAGES[id] : CHAMBER_IMAGES[id]) ?? null,
      sourceId: null,
      defaultCategory: null,
      categories: [],
    })),
  }))
}

const BUILTIN_CHAPTERS: Record<string, Chapter[]> = {
  sp: builtInChapters(SP_CHAPTERS, 'sp'),
  coop: builtInChapters(COOP_CHAPTERS, 'coop'),
  story: builtInChapters(MEL_STORY_CHAPTERS, 'story'),
  advanced: builtInChapters(MEL_ADVANCED_CHAPTERS, 'advanced'),
}

/** Built-in maps by id, for the chamber images and map file names the catalog doesn't carry. */
const BUILTIN_MAPS = new Map(
  Object.values(BUILTIN_CHAPTERS)
    .flat()
    .flatMap((c) => c.maps)
    .map((m) => [m.id, m]),
)

/** A built-in map's own image (the site's bundled one), by its id. */
export const builtInImage = (id: string): string | null => BUILTIN_MAPS.get(id)?.image ?? null

function indexMaps(chaptersByMode: Record<string, Chapter[]>) {
  const maps = new Map<string, MapInfo>()
  for (const chapters of Object.values(chaptersByMode)) {
    for (const c of chapters) for (const m of c.maps) maps.set(`${m.game}:${m.id}`, m)
  }
  return maps
}

/** The built-in Portal 2 and Mel lists, used while the catalog loads or when it can't be fetched. */
export const BUILTIN_CATALOG: Catalog = {
  games: BUILTIN_GAMES,
  modeGame: BUILTIN_MODE_GAME,
  multiplayerModes: new Set(['coop']),
  modeLabels: { ...BASE_MODE_LABELS },
  chaptersByMode: BUILTIN_CHAPTERS,
  maps: indexMaps(BUILTIN_CHAPTERS),
  fromServer: false,
}

// --- server catalog ---------------------------------------------------------------------

/** Builds the site's catalog from GET /catalog; an empty or missing one gives the built-in data. */
export function buildCatalog(raw: CatalogRaw | null | undefined): Catalog {
  if (!Array.isArray(raw) || !raw.length) return BUILTIN_CATALOG
  const byId = new Map(raw.map((g) => [g.id, g]))
  const games: Record<string, Game> = {}
  const modeGame: Record<string, string> = {}
  const multiplayerModes = new Set<string>()
  const modeLabels: Record<string, string> = { ...BASE_MODE_LABELS }
  const chaptersByMode: Record<string, Chapter[]> = {}

  for (const g of raw) {
    const key = gameKey(g)
    const builtin = g.id in BUILTIN_KEYS
    const base = g.base_game_id != null ? byId.get(g.base_game_id) : undefined
    const modeKey = (m: string) => (builtin ? m : `${key}-${m}`)

    const groups = new Map<string, { multiplayer: boolean; mode: string; chapters: typeof g.chapters }>()
    for (const c of g.chapters) {
      if (!c.maps.length) continue
      const mk = modeKey(c.game_mode)
      const group = groups.get(mk) ?? { multiplayer: c.is_multiplayer, mode: c.game_mode, chapters: [] }
      group.chapters.push(c)
      groups.set(mk, group)
    }
    // Single player boards first, then co-op.
    const modes = [...groups.keys()].sort(
      (a, b) => Number(groups.get(a)!.multiplayer) - Number(groups.get(b)!.multiplayer),
    )
    const isMel = BUILTIN_KEYS[g.id] === 'mel' || (base != null && BUILTIN_KEYS[base.id] === 'mel')
    games[key] = {
      id: key,
      dbId: g.id,
      slug: g.slug,
      label: g.name,
      kind: g.kind,
      hidden: g.hidden,
      base: base ? gameKey(base) : null,
      startsAt: g.starts_at,
      endsAt: g.ends_at,
      gameDir: isMel ? 'portal_stories' : 'portal2',
      modes,
      shortName: g.short_name || null,
      logo: g.logo_version ? apiUrl(`/games/${g.id}/images/logo`, { v: g.logo_version }) : null,
      background: g.background_version
        ? apiUrl(`/games/${g.id}/images/background`, { v: g.background_version })
        : null,
    }

    for (const mk of modes) {
      const group = groups.get(mk)!
      modeGame[mk] = key
      if (group.multiplayer) multiplayerModes.add(mk)
      // The game's own name for the board, if it has one.
      modeLabels[mk] = g.mode_names?.[group.mode] || defaultModeLabel(group.mode)
      chaptersByMode[mk] = group.chapters.map((c, i) => ({
        name: c.name || `Chapter ${i + 1}`,
        number: i + 1,
        dbId: c.id,
        mode: mk,
        game: key,
        multiplayer: c.is_multiplayer,
        maps: c.maps.map((m) => {
          const known = BUILTIN_MAPS.get(m.source_map || m.steam_id)
          return {
            id: m.steam_id,
            title: m.name,
            mode: mk,
            game: key,
            bsp: m.bsp_name || known?.bsp || null,
            // Legacy kept the raw name here (null for an unnamed chapter).
            chapter: c.name ?? '',
            chapterNumber: i + 1,
            // An image uploaded in the games editor, else the site's built-in one.
            image: m.image_version
              ? apiUrl(`/maps/${encodeURIComponent(m.steam_id)}/image`, { v: m.image_version })
              : (known?.image ?? null),
            sourceId: m.source_map || null,
            defaultCategory: m.default_cat_id,
            categories: m.categories ?? [],
          }
        }),
      }))
    }
  }

  return {
    games,
    modeGame,
    multiplayerModes,
    modeLabels,
    chaptersByMode,
    maps: indexMaps(chaptersByMode),
    fromServer: true,
  }
}
