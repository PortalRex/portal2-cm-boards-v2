import { queryOptions } from '@tanstack/react-query'
import { player } from '@/lib/adapters/runs'
import { api } from '@/lib/api-client'
import { countryById, type Country } from '@/lib/data/countries'
import { queryKeys } from '@/lib/query-keys'
import type { Player } from '@/types/runs'

interface CountryStatsRaw {
  country_id: number | null
  players: number
  points: number
  top: { profile_number: string; user_name: string | null; avatar: string | null; points: number }[]
}

export interface CountryStats {
  country: Country | null
  players: number
  points: number
  /** The country's best players, best first (up to 5). */
  top: { player: Player; points: number }[]
}

/** Countries on a Portal 2 points board ("overall", "sp" or "coop"), most players first. */
export async function getCountryStats(board: string, signal?: AbortSignal): Promise<CountryStats[]> {
  const rows = await api.get<CountryStatsRaw[]>('/countries/stats', { params: { board }, signal })
  return rows.map((c) => ({
    country: countryById(c.country_id),
    players: c.players,
    points: c.points,
    top: c.top.map((t) => ({ player: player(t.profile_number, t.user_name, t.avatar), points: t.points })),
  }))
}

export const countryStatsQueryOptions = (board: string) =>
  queryOptions({
    queryKey: queryKeys.countryStats(board),
    queryFn: ({ signal }) => getCountryStats(board, signal),
  })
