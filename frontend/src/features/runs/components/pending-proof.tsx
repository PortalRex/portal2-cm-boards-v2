import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { cn } from 'cn'
import { useCurrentUser } from '@/hooks/use-current-user'
import { isStaff } from '@/lib/auth'
import { invalidateRun } from '@/lib/invalidate'
import type { CoopHalf, Player } from '@/types/runs'
import { addRunDemo } from '../api/submissions'

export interface PendingRun {
  changelogId: number
  coopId?: number | null
  players?: Player[]
  demoId?: number | null
  verified?: boolean
  banned?: boolean
}

/** Uploads a demo for a run (resolves to whether it's verified now) and refreshes the run. */
function useAddDemo(run: PendingRun) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => addRunDemo(run.changelogId, file),
    onSuccess: () =>
      invalidateRun(qc, {
        changelogId: run.changelogId,
        coopId: run.coopId,
        profileNumbers: (run.players ?? []).map((p) => p.profileNumber),
      }),
  })
}

/**
 * A pending run without a demo: its player (or co-op partner), or staff, can add the demo. The
 * server checks the map, the exact time and the player, then verifies the run. A co-op run needs
 * a demo from each player, so it keeps the button while one is missing; a player who has added
 * theirs (`halves`) is told it's waiting for their partner.
 */
export function PendingProof({ run, halves }: { run: PendingRun; halves?: CoopHalf[] | null }) {
  const user = useCurrentUser()
  const upload = useAddDemo(run)
  const players = run.players ?? []
  const coop = players.length > 1
  if (!user || user.sample || run.verified !== false || run.banned || (run.demoId && !coop)) return null
  const mine = players.some((p) => p.profileNumber === user.profileNumber)
  if (!mine && !isStaff(user)) return null
  const added = halves?.some((h) => h.player?.profileNumber === user.profileNumber && h.demoId != null)

  const message = upload.isSuccess
    ? upload.data
      ? 'Demo added. The run is verified.'
      : 'Demo added. The run stays pending until your partner adds theirs.'
    : added
      ? 'This run is pending until your partner adds their demo.'
      : coop
        ? 'This run is pending until both players have added their demo.'
        : 'This run is pending until its demo is added.'
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-md bg-pending px-3.5 py-2.5 text-base text-pending-text">
      <span>{message}</span>
      {!upload.isSuccess && !added && <DemoButton upload={upload} label="Add demo" />}
      {upload.error && <span className="basis-full text-sm text-banned-text">{upload.error.message}</span>}
    </div>
  )
}

/**
 * A co-op run that wasn't a personal best for the signed-in player: they're in it without a run
 * of their own, so it has no demo of theirs. They can add it (pending runs have
 * {@link PendingProof} for that).
 */
export function PartnerDemo({ run, halves }: { run: PendingRun; halves?: CoopHalf[] | null }) {
  const user = useCurrentUser()
  const upload = useAddDemo(run)
  if (!user || user.sample || run.verified === false || run.banned || !halves) return null
  const half = halves.find((h) => h.player?.profileNumber === user.profileNumber)
  // Their demo shows on their half once it's in; the message stays until then.
  if (!half || half.changelogId != null || (half.demoId != null && !upload.isSuccess)) return null

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-md bg-row px-3.5 py-2.5 text-base text-text-2">
      <span>
        {upload.isSuccess
          ? 'Your demo was added to the run.'
          : 'This run wasn’t a personal best for you, so it has no demo of yours. Add it so both players’ views are kept.'}
      </span>
      {!upload.isSuccess && <DemoButton upload={upload} label="Add your demo" />}
      {upload.error && <span className="basis-full text-sm text-banned-text">{upload.error.message}</span>}
    </div>
  )
}

function DemoButton({ upload, label }: { upload: UseMutationResult<boolean, Error, File>; label: string }) {
  return (
    <label
      className={cn(
        'inline-flex h-8 cursor-pointer items-center rounded-[4px] border border-current px-3.5 whitespace-nowrap text-foreground hover:bg-white/6',
        upload.isPending && 'cursor-default opacity-60',
      )}
    >
      {upload.isPending ? 'Checking demo…' : label}
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
  )
}
