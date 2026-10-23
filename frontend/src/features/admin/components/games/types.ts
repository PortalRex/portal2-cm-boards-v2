import type { CatalogGameRaw, CatalogMapRaw } from '@/lib/catalog'

/** A map of any game, with its game and whether its chapter is co-op (for linking). */
export interface EditorMap extends CatalogMapRaw {
  game: CatalogGameRaw
  multiplayer: boolean
}

/** What every editor part gets told after a change: reload the catalog. */
export type OnChanged = () => Promise<void> | void
