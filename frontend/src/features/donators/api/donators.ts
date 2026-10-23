import { queryOptions } from '@tanstack/react-query'
import { player } from '@/lib/adapters/runs'
import { api } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import type { Player } from '@/types/runs'

/** GET /donators: users with a donation (server models/users.rs). */
export interface DonatorRaw {
  profile_number: string
  board_name: string | null
  steam_name: string | null
  avatar: string | null
  /** A decimal as text ("101", "12.50"). */
  donation_amount: string | null
}

export interface Donator extends Player {
  amount: number
}

/** Biggest total first, then by name (as legacy sorted them). */
export async function getDonators(signal?: AbortSignal): Promise<Donator[]> {
  const raw = await api.get<DonatorRaw[]>('/donators', { signal })
  return raw
    .map((u) => ({
      ...player(u.profile_number, u.board_name || u.steam_name, u.avatar),
      amount: Number.parseFloat(u.donation_amount ?? '') || 0,
    }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

export const donatorsQueryOptions = () =>
  queryOptions({ queryKey: queryKeys.donators(), queryFn: ({ signal }) => getDonators(signal) })
