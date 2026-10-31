import { useQueryClient } from '@tanstack/react-query'
import { useLocation } from '@tanstack/react-router'
import { cn } from 'cn'
import { useEffect, useRef, useState } from 'react'
import { AppLink } from '@/components/app-link'
import { InboxIcon } from '@/components/icons'
import { useCurrentUser } from '@/hooks/use-current-user'
import { ACTIONS, TONES, type ActionTone } from '@/lib/admin-actions'
import { isStaff } from '@/lib/auth'
import { getMap, mapPath, useCatalog, type Catalog } from '@/lib/catalog'
import { formatDate, formatScore, timeAgo } from '@/lib/format'
import type { AuditEntry } from '../api/audit'
import { inboxQueryOptions, markInboxSeen, type StaffInboxData } from '../api/inbox'
import { useStaffInbox } from '../hooks/use-staff-inbox'

const REPORTS = '/admin?section=reports'

const DOTS: Record<ActionTone, string> = {
  info: 'bg-[#4f8cc9]',
  ok: 'bg-[#4caf6a]',
  warn: 'bg-[#e0a63a]',
  bad: 'bg-[#e05252]',
}

const count = (n: number) => (n > 99 ? '99+' : String(n))
const reportsWord = (n: number) => `open report${n === 1 ? '' : 's'}`

/** What an entry is about, and where it links: the run's map (a new report: the reports list), the profile, or the log. */
function describe(catalog: Catalog, e: AuditEntry) {
  if (e.run_id || e.map_id) {
    const map = e.map_id ? getMap(catalog, e.map_id, e.game_id === 2 ? 'mel' : 'portal2') : undefined
    const players = [e.player_name || e.player, e.partner_name].filter(Boolean).join(' & ')
    const score = e.score != null ? formatScore(e.score) : null
    return {
      title: map?.title || e.map_name || `Run #${e.target_id}`,
      sub: [players, score].filter(Boolean).join(' · '),
      note: e.action === 'report.new' ? e.reason : null,
      // The run itself (its time, demo and the staff tools) while it exists, else its map.
      to:
        e.action === 'report.new'
          ? REPORTS
          : e.run_exists && e.run_id != null
            ? `/run/${e.run_id}`
            : map
              ? mapPath(map)
              : '/admin',
    }
  }
  if (e.target_type === 'profile')
    return { title: e.target_name || e.target_id, sub: null, note: null, to: `/profile/${e.target_id}` }
  let name: string | undefined
  try {
    name = (JSON.parse(e.details ?? '{}') as { name?: string }).name
  } catch {
    name = undefined
  }
  return { title: `${e.target_type} ${name ?? e.target_id}`, sub: null, note: null, to: '/admin' }
}

/**
 * Staff only: an inbox next to the avatar. A red badge counts staff actions (the audit log) since
 * you last opened it, not counting your own; an amber one counts open run reports. Opening it
 * marks the entries read. Updates live.
 */
export function StaffInbox() {
  const user = useCurrentUser()
  const qc = useQueryClient()
  const catalog = useCatalog()
  const data = useStaffInbox(isStaff(user)).data
  const { pathname } = useLocation()
  // Open on the page it was opened on, so going to another page closes it.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname
  // Entries newer than this are highlighted while the inbox is open.
  const [highlightAfter, setHighlightAfter] = useState<number | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node))
        setOpenOn(null)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const toggle = () => {
    if (open) return setOpenOn(null)
    setOpenOn(pathname)
    const newest = data?.items[0]?.id
    setHighlightAfter(data?.unread ? (data.seen_id ?? 0) : null)
    if (newest && data.unread) {
      // The badge clears now; seen_id follows once the server has it (the live wait then reloads).
      qc.setQueryData<StaffInboxData>(inboxQueryOptions().queryKey, (d) => d && { ...d, unread: 0 })
      markInboxSeen(newest).catch(() => {})
    }
  }

  const unread = data?.unread ?? 0
  const openReports = data?.open_reports ?? 0
  const items = data?.items ?? []
  const reportsBadge =
    'min-w-4 rounded-lg bg-[#e0a63a] px-1 text-center text-[11px] leading-4 font-bold text-[#241a05]'
  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        className={cn(
          'relative inline-flex cursor-pointer rounded-full border-0 bg-transparent p-1.5 text-text-2 hover:bg-control-raised hover:text-foreground',
          open && 'bg-control-raised text-foreground',
        )}
        onClick={toggle}
        aria-expanded={open}
        aria-label={`Staff inbox${unread ? `, ${unread} new` : ''}${openReports ? `, ${openReports} ${reportsWord(openReports)}` : ''}`}
        title={openReports ? `Staff inbox · ${openReports} ${reportsWord(openReports)}` : 'Staff inbox'}
      >
        <InboxIcon className="size-[26px]" />
        {unread > 0 && (
          <span className="absolute top-0 -right-0.5 h-[18px] min-w-[18px] rounded-[9px] bg-[#d9363e] px-[5px] text-center text-xs leading-[18px] font-bold text-white">
            {count(unread)}
          </span>
        )}
        {openReports > 0 && (
          <span className={cn(reportsBadge, 'absolute -right-0.5 -bottom-px h-4')}>{count(openReports)}</span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Staff inbox"
          className="glass-float absolute top-[52px] right-0 z-50 w-[380px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[12px] bg-menu shadow-[0_12px_30px_rgba(0,0,0,0.45)] upto600:fixed upto600:top-[72px] upto600:right-4 upto600:left-4 upto600:w-auto upto600:max-w-none"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3 text-[17px]">
            <strong>Staff actions</strong>
            <AppLink href="/admin" className="text-[15px] text-brand-light">
              Admin log
            </AppLink>
          </div>
          {openReports > 0 && (
            <AppLink
              href={REPORTS}
              className="flex items-center border-b border-line px-4 py-2.5 text-[15px] hover:bg-control-raised"
            >
              <span className={cn(reportsBadge, 'mr-2 inline-block h-4')}>{openReports}</span>
              {reportsWord(openReports)} to review
            </AppLink>
          )}
          {!items.length ? (
            <p className="m-0 p-4 text-text-muted">Nothing yet.</p>
          ) : (
            <ul className="m-0 max-h-[min(70vh,520px)] list-none overflow-y-auto px-0 py-1">
              {items.map((e) => {
                const what = describe(catalog, e)
                const isNew =
                  highlightAfter != null && e.id > highlightAfter && e.admin_profile !== user?.profileNumber
                return (
                  // Legacy's highlight colour came from a variable only set on the player's own
                  // rows, so new entries just get the brand edge.
                  <li
                    key={e.id}
                    className={cn(isNew && 'shadow-[inset_3px_0_0_var(--brand)]')}
                    data-new={isNew || undefined}
                  >
                    <AppLink href={what.to} className="flex gap-2.5 px-4 py-2 hover:bg-control-raised">
                      <span
                        aria-hidden
                        className={cn(
                          'mt-[7px] size-[9px] flex-none rounded-full',
                          DOTS[TONES[e.action] ?? 'info'],
                        )}
                      />
                      <span className="flex min-w-0 flex-col text-[15px] leading-[1.35]">
                        <span>
                          <b className="font-semibold">{ACTIONS[e.action] ?? e.action}</b> {what.title}
                        </span>
                        {what.sub && <span className="truncate text-[13px] text-text-muted">{what.sub}</span>}
                        {what.note && (
                          <span className="line-clamp-2 text-[13px] text-text-2 italic">“{what.note}”</span>
                        )}
                        <span
                          className="truncate text-[13px] text-text-muted"
                          title={formatDate(e.created_at)}
                        >
                          {e.action === 'report.new'
                            ? 'Player report'
                            : e.via_service
                              ? 'Board service'
                              : e.admin_name}{' '}
                          · {timeAgo(e.created_at)}
                        </span>
                      </span>
                    </AppLink>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
