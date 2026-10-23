import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from 'cn'
import { BannedIcon } from '@/components/icons'
import { useCurrentUser } from '@/hooks/use-current-user'
import { ApiError } from '@/lib/api-client'
import { isStaff } from '@/lib/auth'
import { invalidateRun } from '@/lib/invalidate'
import { setRunBanned } from '@/lib/runs/moderation'
import type { Run } from '@/types/runs'

/**
 * A small ban / unban switch for staff on a row of runs (hidden from players and while viewing the
 * site as one). One click: a ban can be undone, and it goes to the audit log like the one in Run
 * details, without a reason. Co-op runs are banned as a whole.
 */
export function BanToggle({
  run,
  size = 18,
}: {
  run: Pick<Run, 'id' | 'banned' | 'coopId' | 'players'>
  size?: number
}) {
  const user = useCurrentUser()
  const qc = useQueryClient()
  const act = useMutation({
    mutationFn: () => setRunBanned(run.id, !run.banned, undefined),
    onSuccess: () =>
      invalidateRun(qc, {
        changelogId: run.id,
        coopId: run.coopId,
        profileNumbers: run.players.map((p) => p.profileNumber),
      }),
  })
  if (!isStaff(user)) return null

  const label = run.banned ? 'Unban run' : 'Ban run'
  const failed = act.isError
    ? `Couldn't ${run.banned ? 'unban' : 'ban'} this run${act.error instanceof ApiError ? `: ${act.error.message}` : '.'}`
    : null
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={run.banned}
      title={failed ?? label}
      disabled={act.isPending}
      onClick={(e) => {
        e.stopPropagation()
        act.mutate()
      }}
      className={cn(
        'inline-flex cursor-pointer border-0 bg-transparent p-0 disabled:cursor-default disabled:opacity-50',
        run.banned || failed ? 'text-banned-text' : 'text-text-dim hover:text-banned-text',
      )}
    >
      <BannedIcon width={size} height={size} />
    </button>
  )
}
