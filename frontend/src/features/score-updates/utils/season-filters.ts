import { seasonBoard, seasonMap, type Catalog } from '@/lib/catalog'
import type { ScoreFilters } from './filters'

/**
 * The board and chamber filters (the game's, as the address keeps them) for one of `game`'s
 * seasons: a season's boards and maps are copies of the game's, so "Single player" or "Doors" ask
 * for the season's copy. One without a copy stays as it is, which matches none of its runs.
 */
export function seasonFilters<F extends Pick<ScoreFilters, 'mode' | 'mapId'>>(
  c: Catalog,
  game: string,
  season: string | null,
  f: F,
): F {
  if (!season) return f
  return {
    ...f,
    mode: f.mode && (seasonBoard(c, season, game, f.mode) ?? f.mode),
    mapId: f.mapId && (seasonMap(c, season, f.mapId)?.id ?? f.mapId),
  }
}
