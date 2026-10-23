import { defaultModeLabel, type CatalogGameRaw } from '@/lib/catalog'

// Pure helpers for the games editor.

/** A UTC time without a zone ("2026-10-01T00:00:00") for a datetime-local input, and back. */
export const toInput = (ts: string | null | undefined): string => (ts ? String(ts).slice(0, 16) : '')
export const fromInput = (v: string): string | null => (v ? `${v}:00` : null)

/** A game's link name from its name: lowercase letters, digits and dashes, at most 32. */
export const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)

/** A mode's key from its name: lowercase letters, digits and underscores, at most 20. */
export const modeKey = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20)

/** A game's modes (boards): the ones its chapters use plus any named here that no chapter uses yet. */
export const gameModes = (game: Pick<CatalogGameRaw, 'chapters' | 'mode_names'>): string[] => [
  ...new Set([...game.chapters.map((c) => c.game_mode), ...Object.keys(game.mode_names ?? {})]),
]

/** What the site calls a mode ("sp" is "Singleplayer" unless the game renamed it). */
export const modeName = (game: Pick<CatalogGameRaw, 'mode_names'>, mode: string): string =>
  game.mode_names?.[mode] || defaultModeLabel(mode)

/** The editor's working layout: chapters in order, each with its maps' ids in order. */
export type Layout = { id: number; maps: string[] }[]

/**
 * Moves a map into a chapter, before another map (or at the end). Single player and co-op maps
 * stay in their kind of chapter: a move across is ignored.
 */
export function moveMap(
  layout: Layout,
  multiplayer: (chapterId: number) => boolean | undefined,
  steamId: string,
  toChapter: number,
  beforeId: string | null,
): Layout {
  const from = layout.find((c) => c.maps.includes(steamId))?.id
  if (from != null && multiplayer(from) !== multiplayer(toChapter)) return layout
  return layout
    .map((c) => ({ ...c, maps: c.maps.filter((m) => m !== steamId) }))
    .map((c) => {
      if (c.id !== toChapter) return c
      const maps = [...c.maps]
      const at = beforeId ? maps.indexOf(beforeId) : -1
      maps.splice(at < 0 ? maps.length : at, 0, steamId)
      return { ...c, maps }
    })
}

/** Moves the chapter at `index` up (-1) or down (+1), within the list. */
export function moveChapter(layout: Layout, index: number, delta: number): Layout {
  const next = [...layout]
  const [chapter] = next.splice(index, 1)
  if (!chapter) return layout
  next.splice(Math.max(0, Math.min(next.length, index + delta)), 0, chapter)
  return next
}
