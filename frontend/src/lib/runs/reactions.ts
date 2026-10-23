import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

// Thumbs up / down on runs.

export type Reaction = 1 | -1

export interface Reactions {
  up: number
  down: number
  mine: Reaction | null
}

/** Sets (or with null clears) the signed-in player's reaction; answers the new counts. */
export const setReaction = (changelogId: number, reaction: 'up' | 'down' | null) =>
  api.put<Reactions>(`/runs/${changelogId}/reaction`, { body: { reaction } })

/** The signed-in viewer's reactions on several runs: { [changelogId]: 1 | -1 }. */
export const getMyReactions = (ids: number[], signal?: AbortSignal): Promise<Record<string, Reaction>> =>
  ids.length
    ? api.get<Record<string, Reaction>>('/runs/reactions/mine', { params: { ids: ids.join(',') }, signal })
    : Promise.resolve({})

export const myReactionsQueryOptions = (ids: number[]) =>
  queryOptions({
    queryKey: queryKeys.myReactions(ids),
    // Like legacy: without them the buttons simply show no reaction of yours.
    queryFn: ({ signal }) => getMyReactions(ids, signal).catch(() => ({}) as Record<string, Reaction>),
  })

export const reactionsQueryOptions = (changelogId: number) =>
  queryOptions({
    queryKey: queryKeys.runReactions(changelogId),
    queryFn: ({ signal }) => api.get<Reactions>(`/runs/${changelogId}/reactions`, { signal }),
  })
