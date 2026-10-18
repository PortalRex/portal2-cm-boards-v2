import { adaptChangelog } from '@/lib/adapters/runs'
import { api } from '@/lib/api-client'
import { gameIdParam, type Catalog } from '@/lib/catalog'
import { parseTimestamp } from '@/lib/format'
import type { ChangelogRaw, Run } from '@/types/runs'

// A player's runs and ranks in a game, as profiles and Compare read them.

/** The player's runs in a game (legacy asked for them unfiltered, banned included). */
export const getPlayerRuns = async (
  c: Catalog,
  profileNumber: string,
  game: string,
  limit: number,
  signal?: AbortSignal,
): Promise<Run[]> =>
  (
    await api.get<ChangelogRaw[]>('/changelog', {
      params: { profile_number: profileNumber, limit, ...gameIdParam(c, game) },
      signal,
    })
  ).map((r) => adaptChangelog(r, game, c))

/** The player's rank on each of a game's maps (GET /ranks/game/{game_id}/{steam id}). */
export const getGameRanks = (c: Catalog, profileNumber: string, game: string, signal?: AbortSignal) =>
  api.get<Record<string, number>>(`/ranks/game/${c.games[game]?.dbId}/${profileNumber}`, { signal })

const time = (ts: string | null | undefined) => parseTimestamp(ts)?.getTime() ?? 0

/** The latest run on each map, by map id. */
export function latestRuns(history: Run[]): Record<string, Run> {
  const latest: Record<string, Run> = {}
  for (const h of history) {
    const seen = latest[h.map.id]
    if (!seen || time(h.timestamp) > time(seen.timestamp)) latest[h.map.id] = h
  }
  return latest
}
