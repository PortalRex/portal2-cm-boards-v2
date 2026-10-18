import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from 'cn'
import { useCurrentUser } from '@/hooks/use-current-user'
import { isStaff } from '@/lib/auth'
import { invalidateRun } from '@/lib/invalidate'
import type { Player } from '@/types/runs'
import { addRunDemo } from '../api/submissions'

export interface PendingRun {
  changelogId: number
  coopId?: number | null
  players?: Player[]
  demoId?: number | null
  verified?: boolean
  banned?: boolean
}

/**
 * A pending run without a demo: its player (or co-op partner), or staff, can add the demo. The
 * server checks the map, the exact time and the player, then verifies the run. A co-op run needs
 * a demo from each player, so it keeps the button while one is missing.
 */
export function PendingProof({ run }: { run: PendingRun }) {
  const user = useCurrentUser()
  const qc = useQueryClient()
  const players = run.players ?? []
  const coop = players.length > 1
  const upload = useMutation({
    mutationFn: (file: File) => addRunDemo(run.changelogId, file),
    onSuccess: () =>
      invalidateRun(qc, {
        changelogId: run.changelogId,
        coopId: run.coopId,
        profileNumbers: players.map((p) => p.profileNumber),
      }),
  })
  if (!user || user.sample || run.verified !== false || run.banned || (run.demoId && !coop)) return null
  const mine = players.some((p) => p.profileNumber === user.profileNumber)
  if (!mine && !isStaff(user)) return null

  const message = upload.isSuccess
    ? upload.data
      ? 'Demo added. The run is verified.'
      : 'Demo added. The run stays pending until your partner adds theirs.'
    : coop
      ? 'This run is pending until both players have added their demo.'
      : 'This run is pending until its demo is added.'
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-md bg-pending px-3.5 py-2.5 text-base text-pending-text">
      <span>{message}</span>
      {!upload.isSuccess && (
        <label
          className={cn(
            'inline-flex h-8 cursor-pointer items-center rounded-[4px] border border-current px-3.5 whitespace-nowrap text-foreground hover:bg-white/6',
            upload.isPending && 'cursor-default opacity-60',
          )}
        >
          {upload.isPending ? 'Checking demo…' : 'Add demo'}
          <input
            type="file"
            accept=".dem"
            hidden
            disabled={upload.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) upload.mutate(file)
              e.target.value = ''
            }}
          />
        </label>
      )}
      {upload.error && <span className="basis-full text-sm text-banned-text">{upload.error.message}</span>}
    </div>
  )
}
