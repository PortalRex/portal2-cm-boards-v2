import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { useState } from 'react'
import { AppLink } from '@/components/app-link'
import { PlayerLink } from '@/components/player-link'
import { RankNumber } from '@/components/rank'
import { Segmented } from '@/components/segmented'
import { Select } from '@/components/select'
import { EmptyState, Loading } from '@/components/status'
import { ACTIONS } from '@/lib/admin-actions'
import { getMap, mapPath, useCatalog } from '@/lib/catalog'
import { formatScore } from '@/lib/format'
import { invalidateRun } from '@/lib/invalidate'
import { setRunBanned, setRunWrHidden } from '@/lib/runs/moderation'
import { auditQueryOptions, type AuditEntry, type AuditKind } from '../api/audit'
import { ActedBy, ActionBadge, When } from './audit-parts'

const TABS: { value: AuditKind; label: string; actions: string[] }[] = [
  {
    value: 'runs',
    label: 'Runs',
    actions: [
      'run.ban',
      'run.unban',
      'run.verify',
      'run.unverify',
      'run.delete',
      'run.manual_submit',
      'demo.remove',
      'run.hide_wr',
      'run.show_wr',
      'coop.set_partner',
      'coop.set_host',
      'report.new',
      'report.resolved',
      'report.dismissed',
      'report.open',
    ],
  },
  {
    value: 'profiles',
    label: 'Profiles',
    actions: [
      'profile.ban',
      'profile.unban',
      'profile.freeze',
      'profile.unfreeze',
      'profile.set_role',
      'profile.display',
    ],
  },
  {
    value: 'catalog',
    label: 'Games',
    actions: [
      'season.create',
      'game.create',
      'game.update',
      'game.delete',
      'game.layout',
      'game.link',
      'game.unlink',
      'chapter.create',
      'chapter.update',
      'chapter.delete',
      'map.create',
      'map.update',
      'map.delete',
      'map.link',
      'map.unlink',
      'category.create',
      'category.update',
      'category.delete',
    ],
  },
]

const row = 'grid min-h-[52px] items-center gap-x-5 px-4 py-2 text-base [&_a:hover]:underline'
// The action column fits the longest badge ("Removed from WR history"). Below 1100px a run row
// keeps action, map, players and time, with the reason on its own line.
const runRow = cn(
  row,
  'grid-cols-[196px_minmax(0,1.1fr)_minmax(0,1.3fr)_56px_84px_120px_minmax(0,1.2fr)_110px]',
  'upto1100:grid-cols-[170px_minmax(0,1fr)_minmax(0,1fr)_70px] upto1100:[&>:nth-child(4)]:hidden upto1100:[&>:nth-child(6)]:hidden upto1100:[&>:nth-child(8)]:hidden upto1100:[&>:nth-child(7)]:col-span-full',
)
const otherRow = cn(
  row,
  'grid-cols-[196px_220px_160px_minmax(0,1fr)_110px] upto1100:grid-cols-[170px_minmax(0,1fr)_minmax(0,1fr)]',
)
const head = 'min-h-8 text-sm text-text-muted uppercase'
const actedBy = 'min-w-0 truncate pl-2'

/** Staff: every change staff (or the board's services) have made, by kind, newest first. */
export function AuditLog() {
  const [kind, setKind] = useState<AuditKind>('runs')
  const [action, setAction] = useState('')
  const log = useInfiniteQuery(auditQueryOptions(kind, action))
  const tab = TABS.find((t) => t.value === kind)!
  const entries = log.data?.pages.flat() ?? []
  const options = [
    { value: '', label: 'All actions' },
    ...tab.actions.map((value) => ({ value, label: ACTIONS[value] ?? value })),
  ]
  const loading = log.isPending || log.isFetchingNextPage

  return (
    <>
      <div className="mb-[18px] flex flex-wrap items-center gap-x-4 gap-y-3">
        <Segmented
          className="h-[34px]"
          itemClassName="min-w-[110px] text-[17px]"
          label="Log"
          value={kind}
          onChange={(k) => {
            setKind(k)
            setAction('')
          }}
          options={TABS}
        />
        <Select
          size="md"
          className="h-[34px]"
          label="Action"
          value={action}
          onChange={setAction}
          options={options}
        />
      </div>
      {log.isError && <EmptyState>Couldn’t load the admin changelog: {log.error.message}</EmptyState>}
      {!log.isError && !loading && !entries.length && <EmptyState>No admin actions yet.</EmptyState>}
      {entries.length > 0 && (
        <div role="table" aria-label="Admin changelog">
          {kind === 'runs' ? (
            <div role="row" className={cn(runRow, head)}>
              <span>Action</span>
              <span>Map</span>
              <span>Player(s)</span>
              <span className="text-right">Rank</span>
              <span className="text-right">Time</span>
              <span className={actedBy}>Admin</span>
              <span>Reason</span>
              <span className="text-right">When</span>
            </div>
          ) : (
            <div role="row" className={cn(otherRow, head)}>
              <span>Action</span>
              <span>{kind === 'catalog' ? 'What' : 'Profile'}</span>
              <span>Admin</span>
              <span>Reason</span>
              <span className="text-right">When</span>
            </div>
          )}
          {entries.map((e, i) => {
            // The header is the first row, so legacy's even rows are the 1st, 3rd, … entries.
            const striped = i % 2 === 0
            return kind === 'runs' ? (
              <RunEntry key={e.id} entry={e} striped={striped} />
            ) : kind === 'catalog' ? (
              <CatalogEntry key={e.id} entry={e} striped={striped} />
            ) : (
              <ProfileEntry key={e.id} entry={e} striped={striped} />
            )
          })}
        </div>
      )}
      {loading && <Loading />}
      {!loading && log.hasNextPage && entries.length > 0 && (
        <button
          type="button"
          className="mt-4 inline-flex h-10 cursor-pointer items-center justify-center rounded-[4px] border border-line-strong bg-control px-5 text-lg whitespace-nowrap hover:bg-control-raised"
          onClick={() => void log.fetchNextPage()}
        >
          Load more
        </button>
      )}
    </>
  )
}

function Reason({ entry, open, onToggle }: { entry: AuditEntry; open: boolean; onToggle: () => void }) {
  const hasDetails = Boolean(entry.details && entry.details !== '{}')
  return (
    <span className="flex min-w-0 items-center gap-3 wrap-anywhere">
      {entry.reason || <span className="text-text-muted">—</span>}
      {hasDetails && (
        <button
          type="button"
          className="flex-none cursor-pointer border-0 bg-transparent p-0 text-sm whitespace-nowrap text-brand-light"
          onClick={onToggle}
          aria-expanded={open}
        >
          {open ? 'Hide' : 'Details'}
        </button>
      )}
    </span>
  )
}

const pretty = (details: string | null) => {
  try {
    return JSON.stringify(JSON.parse(details ?? '{}'), null, 2)
  } catch {
    return details ?? ''
  }
}

function Details({ entry }: { entry: AuditEntry }) {
  return (
    <pre className="mx-3 mt-0 mb-2 max-h-80 overflow-auto rounded-[4px] bg-row-sub-alt px-3 py-2.5 text-[13px]">
      {pretty(entry.details)}
    </pre>
  )
}

const roleName = (r: string | null | undefined) => (r ? r[0]!.toUpperCase() + r.slice(1) : 'none')
function roleChange(details: string | null) {
  try {
    const d = JSON.parse(details ?? '') as { before?: string | null; role?: string | null }
    return `${roleName(d.before)} → ${roleName(d.role)}`
  } catch {
    return ''
  }
}

// Undo for "Banned run" / "Removed from WR history" while the run is still hidden. The undo is
// itself logged.
const UNDO: Record<
  string,
  { stillHidden: (e: AuditEntry) => boolean; restore: (e: AuditEntry) => Promise<unknown> }
> = {
  'run.ban': {
    stillHidden: (e) => Boolean(e.run_banned),
    restore: (e) => setRunBanned(Number(e.target_id), false, `Undo of #${e.id}`),
  },
  'run.hide_wr': {
    stillHidden: (e) => Boolean(e.run_wr_hidden),
    restore: (e) => setRunWrHidden(Number(e.target_id), false, `Undo of #${e.id}`),
  },
}

function RestoreButton({ entry }: { entry: AuditEntry }) {
  const qc = useQueryClient()
  const undo = UNDO[entry.action]
  const restore = useMutation({
    mutationFn: () => undo!.restore(entry),
    onSuccess: () =>
      Promise.all([
        invalidateRun(qc, {
          changelogId: Number(entry.target_id),
          profileNumbers: [entry.player, entry.partner],
        }),
        qc.invalidateQueries({ queryKey: ['admin', 'audit'] }),
      ]),
  })
  if (!undo || !entry.run_exists) return null
  if (!undo.stillHidden(entry)) return <span className="text-[13px] text-green">Undone</span>
  const ban = entry.action === 'run.ban'
  return (
    <button
      type="button"
      className="cursor-pointer rounded-[4px] border border-brand bg-transparent px-2.5 py-px text-[13px] text-brand-light hover:not-disabled:bg-brand hover:not-disabled:text-white disabled:cursor-default disabled:opacity-60"
      onClick={() => restore.mutate()}
      disabled={restore.isPending}
      title={restore.error?.message ?? 'Put this run back on the boards'}
    >
      {ban ? (restore.isPending ? 'Unbanning…' : 'Unban') : restore.isPending ? 'Restoring…' : 'Restore'}
    </button>
  )
}

function RunEntry({ entry, striped }: { entry: AuditEntry; striped: boolean }) {
  const [open, setOpen] = useState(false)
  const catalog = useCatalog()
  const map = entry.map_id
    ? getMap(catalog, entry.map_id, entry.game_id === 2 ? 'mel' : 'portal2')
    : undefined
  const title =
    map?.title || entry.map_name || (entry.map_id ? `Map ${entry.map_id}` : `Run #${entry.target_id}`)
  const ellipsis = 'truncate'
  return (
    <div>
      <div role="row" className={cn(runRow, striped && 'bg-row')}>
        <span className="flex flex-col items-start gap-1">
          <ActionBadge action={entry.action} />
          <RestoreButton entry={entry} />
        </span>
        <span className="flex min-w-0 flex-col">
          {map && entry.run_exists ? (
            <AppLink href={mapPath(map)} className={ellipsis}>
              {title}
            </AppLink>
          ) : (
            <span className={cn(ellipsis, !entry.run_exists && 'text-text-muted line-through')}>{title}</span>
          )}
          <small className="text-[13px] text-text-muted">
            {map?.chapter ?? ''}
            {!entry.run_exists && ' · run deleted'}
          </small>
        </span>
        <span className="truncate">
          {entry.player && (
            <PlayerLink player={{ profileNumber: entry.player, name: entry.player_name || entry.player }} />
          )}
          {entry.partner && (
            <>
              {' & '}
              <PlayerLink
                player={{ profileNumber: entry.partner, name: entry.partner_name || entry.partner }}
              />
            </>
          )}
        </span>
        <span className="num text-right">
          <RankNumber rank={entry.post_rank} />
        </span>
        <span className="num text-right">{entry.score != null ? formatScore(entry.score) : '—'}</span>
        <span className={actedBy}>
          <ActedBy entry={entry} />
        </span>
        <Reason entry={entry} open={open} onToggle={() => setOpen((o) => !o)} />
        <When entry={entry} />
      </div>
      {open && <Details entry={entry} />}
    </div>
  )
}

/** Game, chapter, map and category edits: what was changed, with the details on demand. */
function CatalogEntry({ entry, striped }: { entry: AuditEntry; striped: boolean }) {
  const [open, setOpen] = useState(false)
  let name: string | undefined
  try {
    name = (JSON.parse(entry.details ?? '{}') as { name?: string }).name
  } catch {
    name = undefined
  }
  return (
    <div>
      <div role="row" className={cn(otherRow, striped && 'bg-row')}>
        <ActionBadge action={entry.action} />
        <span>
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-left text-brand-light"
            onClick={() => setOpen((o) => !o)}
          >
            {entry.target_type} {name ?? entry.target_id}
          </button>
        </span>
        <span className={actedBy}>
          <ActedBy entry={entry} />
        </span>
        <Reason entry={entry} open={open} onToggle={() => setOpen((o) => !o)} />
        <When entry={entry} />
      </div>
      {open && <Details entry={entry} />}
    </div>
  )
}

function ProfileEntry({ entry, striped }: { entry: AuditEntry; striped: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <div role="row" className={cn(otherRow, striped && 'bg-row')}>
        <ActionBadge action={entry.action} />
        <span>
          <Link to="/profile/$profileId" params={{ profileId: entry.target_id }}>
            {entry.target_name || entry.target_id}
          </Link>
          {entry.action === 'profile.set_role' && (
            <small className="block text-[13px] text-text-muted">{roleChange(entry.details)}</small>
          )}
        </span>
        <span className={actedBy}>
          <ActedBy entry={entry} />
        </span>
        <Reason entry={entry} open={open} onToggle={() => setOpen((o) => !o)} />
        <When entry={entry} />
      </div>
      {open && <Details entry={entry} />}
    </div>
  )
}
