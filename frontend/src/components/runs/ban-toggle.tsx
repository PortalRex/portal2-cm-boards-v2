import { cn } from 'cn'
import { BannedIcon } from '@/components/icons'
import { setRunBanned } from '@/lib/runs/moderation'
import { useRunRowAction, type RowRun } from './use-run-row-action'

/**
 * A small ban / unban switch for staff on a row of runs (hidden from players and while viewing the
 * site as one). One click: a ban can be undone, and it goes to the audit log like the one in Run
 * details, without a reason. Co-op runs are banned as a whole.
 */
export function BanToggle({ run, size = 18 }: { run: RowRun; size?: number }) {
  const {
    staff,
    mutation: act,
    failed,
  } = useRunRowAction(run, () => setRunBanned(run.id, !run.banned, undefined), run.banned ? 'unban' : 'ban')
  if (!staff) return null

  const label = run.banned ? 'Unban run' : 'Ban run'
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
