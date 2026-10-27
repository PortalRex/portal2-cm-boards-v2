import { queryOptions } from '@tanstack/react-query'
import { player } from '@/lib/adapters/runs'
import { api } from '@/lib/api-client'
import { PORTAL2, type Catalog } from '@/lib/catalog'
import { queryKeys } from '@/lib/query-keys'
import { getGameRanks, getPlayerRuns, latestRuns } from '@/lib/runs/player-runs'
import type { ProfileScoreRaw } from '@/lib/runs/profile-scores'
import type { Player } from '@/types/runs'

/** A player's best time and rank on a map. */
export interface SideScore {
  score: number
  rank: number | null
}

/** One side of a comparison: the player and their best per map (by map id) in a game. */
export interface CompareSide {
  player: Player
  scores: Record<string, SideScore>
}

/**
 * The player and their best times: Portal 2's personal bests, or for another game (Mel, a season)
 * the rank on each map with the latest run's time.
 */
export async function getCompareSide(
  c: Catalog,
  profileNumber: string,
  game: string,
  signal?: AbortSignal,
): Promise<CompareSide> {
  const scores = async (): Promise<Record<string, SideScore>> => {
    if (game === PORTAL2) {
      // Unlike the profile, legacy let a failure here fail the side.
      const pbs = await api.get<ProfileScoreRaw[]>(`/profile/scores/${profileNumber}`, { signal })
      return Object.fromEntries(pbs.map((r) => [r.map_id, { score: r.score, rank: r.rank }]))
    }
    const [ranks, runs] = await Promise.all([
      getGameRanks(c, profileNumber, game, signal),
      getPlayerRuns(c, profileNumber, game, 500, signal),
    ])
    const latest = latestRuns(runs)
    return Object.fromEntries(
      Object.entries(ranks).flatMap(([mapId, rank]) => {
        const run = latest[mapId]
        return run ? [[mapId, { score: run.score, rank }]] : []
      }),
    )
  }
  const [user, best] = await Promise.all([
    api.get<{ board_name: string | null; steam_name: string | null; avatar: string | null }>(
      `/user/${profileNumber}`,
      { signal },
    ),
    scores(),
  ])
  return { player: player(profileNumber, user?.board_name || user?.steam_name, user?.avatar), scores: best }
}

export const compareSideQueryOptions = (c: Catalog, profileNumber: string, game: string) =>
  queryOptions({
    queryKey: [...queryKeys.compareSide(profileNumber, game), c.fromServer],
    queryFn: ({ signal }) => getCompareSide(c, profileNumber, game, signal),
  })
