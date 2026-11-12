import { cn } from 'cn'
import { VerifyIcon } from '@/components/icons'
import { setRunVerified } from '@/lib/runs/moderation'
import { useRunRowAction, type RowRun } from './use-run-row-action'

/**
 * Approves a pending run in one click, for staff on a row of runs (hidden from players, while
 * viewing the site as one, and on runs that aren't pending or are banned). It goes to the audit log
 * like "Verify run" in Run details, without a reason; co-op runs are verified as a whole.
 */
export function VerifyButton({
  run,
  size = 18,
  className,
}: {
  run: RowRun
  size?: number
  className?: string
}) {
  const {
    staff,
    mutation: act,
    failed,
  } = useRunRowAction(run, () => setRunVerified(run.id, true, undefined), 'verify')
  if (!staff || run.verified || run.banned) return null

  return (
    <button
      type="button"
      aria-label="Verify run"
      title={failed ?? 'Verify run'}
      disabled={act.isPending}
      onClick={(e) => {
        e.stopPropagation()
        act.mutate()
      }}
      className={cn(
        'inline-flex cursor-pointer border-0 bg-transparent p-0 align-middle disabled:cursor-default disabled:opacity-50',
        failed ? 'text-banned-text' : 'text-text-dim hover:text-green',
        className,
      )}
    >
      <VerifyIcon width={size} height={size} />
    </button>
  )
}
