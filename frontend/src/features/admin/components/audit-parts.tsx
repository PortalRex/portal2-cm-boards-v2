import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { ACTIONS, TONES, type ActionTone } from '@/lib/admin-actions'
import { formatDate, timeAgo } from '@/lib/format'
import type { AuditEntry } from '../api/audit'

const TONE_CLASSES: Record<ActionTone, string> = {
  ok: 'bg-hl-green',
  warn: 'bg-[#5e4a24] text-[#f1d7a2] light:bg-[#f4e4c4] light:text-[#6b4a10]',
  bad: 'bg-hl-red text-hl-red-text',
  info: 'bg-rank-new',
}

/** An audit-log action's name in its colour. */
export function ActionBadge({ action, className }: { action: string; className?: string }) {
  return (
    <span
      className={cn(
        'max-w-full justify-self-start truncate rounded-[4px] px-2.5 py-[3px] text-sm',
        TONE_CLASSES[TONES[action] ?? 'info'],
        className,
      )}
    >
      {ACTIONS[action] ?? action}
    </span>
  )
}

/** Who did it: a player's report, one of the board's services, or the staff member. */
export function ActedBy({ entry }: { entry: AuditEntry }) {
  if (entry.action === 'report.new') return <i className="text-text-muted">Player report</i>
  if (entry.via_service || !entry.admin_profile) return <i className="text-text-muted">Board service</i>
  return (
    <Link to="/profile/$profileId" params={{ profileId: entry.admin_profile }}>
      {entry.admin_name}
    </Link>
  )
}

/** How long ago, with the date under it. */
export function When({ entry, className }: { entry: AuditEntry; className?: string }) {
  return (
    <span className={cn('flex min-w-0 flex-col text-right', className)} title={formatDate(entry.created_at)}>
      {timeAgo(entry.created_at)}
      <small className="num text-[13px] text-text-muted">{formatDate(entry.created_at)}</small>
    </span>
  )
}
