import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

// A run's comment (server handlers/runs.rs): its player changes it on their own runs until staff
// set or clear it; staff change any.

/** GET /runs/{id}/comment. */
export interface RunComment {
  note: string | null
  /** Staff set or cleared it: the player can't change it. */
  locked: boolean
  /** The viewer may change it. */
  editable: boolean
}

/** The longest comment a run takes. */
export const COMMENT_MAX = 500

export const runCommentQueryOptions = (changelogId: number) =>
  queryOptions({
    queryKey: queryKeys.runComment(changelogId),
    queryFn: ({ signal }) => api.get<RunComment>(`/runs/${changelogId}/comment`, { signal }),
    retry: false,
  })

/** Sets the comment, or clears it with null. */
export const setRunComment = (changelogId: number, note: string | null) =>
  api.put<RunComment>(`/runs/${changelogId}/comment`, { body: { note } })
