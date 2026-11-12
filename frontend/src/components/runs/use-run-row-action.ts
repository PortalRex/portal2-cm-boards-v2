import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentUser } from '@/hooks/use-current-user'
import { ApiError } from '@/lib/api-client'
import { isStaff } from '@/lib/auth'
import { invalidateRun } from '@/lib/invalidate'
import type { Run } from '@/types/runs'

export type RowRun = Pick<Run, 'id' | 'banned' | 'verified' | 'coopId' | 'players'>

/**
 * A staff action on a row of runs (ban, verify): one click, no reason, refreshing the run and its
 * boards when done. `staff` is false for players and while viewing the site as one; `failed` says
 * what went wrong, for the button's title.
 */
export function useRunRowAction(run: RowRun, act: () => Promise<unknown>, what: string) {
  const user = useCurrentUser()
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: act,
    onSuccess: () =>
      invalidateRun(qc, {
        changelogId: run.id,
        coopId: run.coopId,
        profileNumbers: run.players.map((p) => p.profileNumber),
      }),
  })
  const failed = mutation.isError
    ? `Couldn't ${what} this run${mutation.error instanceof ApiError ? `: ${mutation.error.message}` : '.'}`
    : null
  return { staff: isStaff(user), mutation, failed }
}
