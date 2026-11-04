import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { api, apiUrl } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

/** What the demo parser read from a demo (server demo-parser/parse_demo.mjs, as stored). */
export interface ParsedDemo {
  mapName: string | null
  gameDirectory: string | null
  clientName: string | null
  /** Centiseconds; null when the demo has no finished run the parser recognises. */
  timeScore: number | null
  portalScore: number | null
  /** "scoreboard" (the game's end-of-run message) or "sar" (SAR's timer, for a co-op run without one). */
  timeSource: string | null
  players: { steamId: string; name: string }[]
}

/**
 * A demo refused at submission for a reason that may be the parser's or the game's, kept for
 * staff (server controllers/held_demos.rs HeldDemoRow).
 */
export interface HeldDemo {
  id: number
  profile_number: string
  user_name: string
  avatar: string | null
  map_id: string | null
  map_name: string | null
  game_id: number | null
  is_coop: boolean | null
  source: 'submit' | 'autosubmit'
  /** The time SAR sent (auto-submit). */
  claimed_score: number | null
  /** The refusal, as the player was told it. */
  reason: string
  file_size: number
  /** Null when the parser couldn't read the demo. */
  parsed: ParsedDemo | null
  note: string | null
  youtube_id: string | null
  status: 'pending' | 'accepted' | 'dismissed'
  /** The run recorded when it was accepted. */
  changelog_id: number | null
  reviewed_by_name: string | null
  /** UTC without a zone, like the other admin times. */
  reviewed_at: string | null
  review_note: string | null
  created_at: string
}

export type HeldFilter = 'pending' | 'accepted' | 'dismissed' | 'all'

export const HELD_PAGE = 50

export const heldDemosQueryOptions = (status: HeldFilter) =>
  infiniteQueryOptions({
    queryKey: queryKeys.admin.heldDemos(status),
    queryFn: ({ pageParam, signal }) =>
      api.get<HeldDemo[]>('/admin/held-demos', { params: { status, before: pageParam }, signal }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => (last.length < HELD_PAGE ? undefined : last[last.length - 1]?.id),
  })

/** Held demos waiting, for the count on the section switch. */
export const heldDemoCountQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.admin.heldDemoCount(),
    queryFn: async ({ signal }) =>
      (await api.get<{ pending: number }>('/admin/held-demos/count', { signal })).pending,
  })

/** Where a waiting held demo downloads from. */
export const heldDemoFileUrl = (id: number) => apiUrl(`/admin/held-demos/${id}/file`)

/** Has the parser read a held demo again; what it reads now (null: it still can't). */
export const recheckHeldDemo = async (id: number) =>
  (await api.post<{ parsed: ParsedDemo | null }>(`/admin/held-demos/${id}/recheck`)).parsed

/** What accepting a held demo answers (Submit Run's answer). */
export interface AcceptedRun {
  changelog_id: number
  map_id: string
  map_name: string
  score: number
  partner: string | null
  waiting_for_partner: boolean
  attached: boolean
}

/** Records the held demo's run, as its submission would have been. */
export const acceptHeldDemo = (id: number, note: string) =>
  api.post<AcceptedRun>(`/admin/held-demos/${id}/accept`, { body: { note: note || null } })

/** Dismisses a held demo; its file is deleted. */
export const dismissHeldDemo = (id: number, note: string) =>
  api.post(`/admin/held-demos/${id}/dismiss`, { body: { note: note || null } })
