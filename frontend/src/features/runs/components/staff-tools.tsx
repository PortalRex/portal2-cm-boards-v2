import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from 'cn'
import { useState, type FormEvent, type ReactNode } from 'react'
import { PlayerLink } from '@/components/player-link'
import { Segmented } from '@/components/segmented'
import { setCoopRoleOverride, useCoopRoleOverrides } from '@/hooks/use-coop-role-overrides'
import { useCurrentUser } from '@/hooks/use-current-user'
import { isRoleAdmin, isStaff } from '@/lib/auth'
import { isMultiplayerMode, useCatalog } from '@/lib/catalog'
import { coopRoles } from '@/lib/coop-roles'
import { formatDate, formatDateTime } from '@/lib/format'
import { invalidateRun } from '@/lib/invalidate'
import type { Player, RunMap } from '@/types/runs'
import {
  addStaffNote,
  deleteRun,
  deleteStaffNote,
  reactionRecordQueryOptions,
  removeRunDemo,
  setCoopHost,
  setRunBanned,
  setRunPartner,
  setRunVerified,
  staffNotesQueryOptions,
} from '../api/staff'

export interface StaffRun {
  changelogId: number
  coopId?: number | null
  players?: Player[]
  rolesKnown?: boolean | null
  demoId?: number | null
  verified?: boolean
  banned?: boolean
}

export const staffButton =
  'h-8 cursor-pointer rounded-[4px] border border-line-strong bg-control px-3 text-[15px] text-text-2 hover:not-disabled:border-text-muted hover:not-disabled:text-foreground disabled:cursor-default disabled:opacity-50'
const confirming = 'border-[#c62828]! bg-[#c62828]! text-white!'
const input = 'h-8 min-w-0 rounded-[4px] border border-line bg-control px-2.5 text-[15px] text-foreground'
const error = 'basis-full text-sm text-banned-text'

/**
 * Staff tools for a run (any staff tier; hidden while viewing the site as a player). Every action
 * goes to the audit log with the optional reason. Removing demos and deleting runs is for admins.
 */
export function StaffTools({ run, map, game }: { run: StaffRun; map: RunMap; game: string }) {
  const user = useCurrentUser()
  const catalog = useCatalog()
  const qc = useQueryClient()
  const [reason, setReason] = useState('')
  const [partner, setPartner] = useState('')
  // Deleting a run and removing a demo can't be undone: they ask for a second click.
  const [confirm, setConfirm] = useState<'delete' | 'demo' | null>(null)
  const act = useMutation({
    mutationFn: ({ fn }: { label: string; fn: () => Promise<unknown> }) => fn(),
    onSuccess: () => {
      setConfirm(null)
      return invalidateRun(qc, {
        changelogId: run.changelogId,
        coopId: run.coopId,
        profileNumbers: (run.players ?? []).map((p) => p.profileNumber),
      })
    },
  })
  if (!isStaff(user)) return null

  const id = run.changelogId
  const coop = run.coopId != null || (run.players?.length ?? 0) > 1 || isMultiplayerMode(catalog, map.mode)
  const why = reason.trim() || undefined
  const busy = act.isPending
  const run2 = (label: string, fn: () => Promise<unknown>) => act.mutate({ label, fn })

  return (
    <div className="mt-3.5 flex flex-col gap-2.5 rounded-[4px] border border-dashed border-line-strong px-3 pt-2.5 pb-3">
      <div className="text-[13px] text-text-muted uppercase">Admin</div>
      {coop && <RolesEditor run={run} />}
      <input
        className={input}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (saved in the audit log)"
        aria-label="Reason"
        maxLength={500}
      />
      <div className="flex flex-wrap gap-2">
        {run.banned ? (
          <button
            type="button"
            className={staffButton}
            disabled={busy}
            onClick={() => run2('Run unbanned.', () => setRunBanned(id, false, why))}
          >
            Unban run
          </button>
        ) : (
          <button
            type="button"
            className={staffButton}
            disabled={busy}
            onClick={() => run2('Run banned.', () => setRunBanned(id, true, why))}
          >
            Ban run
          </button>
        )}
        {!run.banned &&
          (run.verified === false ? (
            <button
              type="button"
              className={staffButton}
              disabled={busy}
              onClick={() => run2('Run verified.', () => setRunVerified(id, true, why))}
            >
              Verify run
            </button>
          ) : (
            <button
              type="button"
              className={staffButton}
              disabled={busy}
              onClick={() => run2('Run marked pending.', () => setRunVerified(id, false, why))}
            >
              Mark pending
            </button>
          ))}
        {isRoleAdmin(user) && run.demoId != null && (
          <button
            type="button"
            className={cn(staffButton, confirm === 'demo' && confirming)}
            disabled={busy}
            onClick={() =>
              confirm === 'demo' ? run2('Demo removed.', () => removeRunDemo(id, why)) : setConfirm('demo')
            }
            onBlur={() => setConfirm(null)}
          >
            <ConfirmLabel confirming={confirm === 'demo'} label="Remove demo" confirm="Confirm removal" />
          </button>
        )}
        {isRoleAdmin(user) && (
          <button
            type="button"
            className={cn(staffButton, 'border-hl-red text-hl-red-text', confirm === 'delete' && confirming)}
            disabled={busy}
            onClick={() =>
              confirm === 'delete' ? run2('Run deleted.', () => deleteRun(id, why)) : setConfirm('delete')
            }
            onBlur={() => setConfirm(null)}
          >
            <ConfirmLabel confirming={confirm === 'delete'} label="Delete run" confirm="Confirm delete" />
          </button>
        )}
      </div>
      {coop && game !== 'mel' && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            if (partner.trim()) run2('Partner set.', () => setRunPartner(id, partner.trim(), why))
          }}
        >
          <input
            className={cn(input, 'flex-1')}
            value={partner}
            onChange={(e) => setPartner(e.target.value)}
            placeholder="Partner SteamID64 (7656119…)"
            aria-label="Partner SteamID64"
            inputMode="numeric"
          />
          <button type="submit" className={staffButton} disabled={busy || !partner.trim()}>
            Set partner
          </button>
        </form>
      )}
      <WhoReacted changelogId={id} />
      <StaffNotes changelogId={id} />
      {act.isSuccess && <span className="text-sm text-green">{act.variables.label}</span>}
      {act.error && <span className={error}>{act.error.message}</span>}
    </div>
  )
}

/**
 * A button label that swaps to its confirmation on the first click. Both are laid out in the same
 * spot, so the button keeps its size and nothing around it moves.
 */
function ConfirmLabel({
  confirming,
  label,
  confirm,
}: {
  confirming: boolean
  label: string
  confirm: string
}) {
  const layer = 'col-start-1 row-start-1'
  return (
    <span className="inline-grid">
      <span className={cn(layer, confirming && 'invisible')} aria-hidden={confirming}>
        {label}
      </span>
      <span className={cn(layer, !confirming && 'invisible')} aria-hidden={!confirming}>
        {confirm}
      </span>
    </span>
  )
}

// Profile numbers are digits, so this can't clash with one.
const UNKNOWN = 'unknown'

/** Sets which co-op player was blue (the host), or marks it unknown. */
function RolesEditor({ run }: { run: StaffRun }) {
  const qc = useQueryClient()
  const { players, rolesKnown } = coopRoles(
    { players: run.players ?? [], coopId: run.coopId, rolesKnown: run.rolesKnown },
    useCoopRoleOverrides(),
  )
  const save = useMutation({
    mutationFn: (host: string | null) => setCoopHost(run.coopId!, host),
    onSuccess: (_, host) => setCoopRoleOverride(qc, run.coopId!, host),
  })
  if (run.coopId == null || players.length !== 2 || players.some((p) => !p.profileNumber)) return null
  const current = rolesKnown ? players[0]!.profileNumber! : UNKNOWN
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-base text-text-2">Blue (host):</span>
      <Segmented
        size="sm"
        label="Blue (host)"
        // Legacy's admin button rule outranked the segmented one here: bordered and 32px tall,
        // in the 30px row.
        itemClassName={cn(staffButton, 'h-8 min-w-0 px-3')}
        value={current}
        onChange={(host) => !save.isPending && save.mutate(host === UNKNOWN ? null : host)}
        options={[
          ...players.map((p) => ({ value: p.profileNumber!, label: p.name })),
          { value: UNKNOWN, label: 'Unknown' },
        ]}
      />
      {save.error && <span className={error}>{save.error.message}</span>}
    </div>
  )
}

const reactionLabel = (r: 1 | -1 | null) => (r === 1 ? '👍' : r === -1 ? '👎' : 'cleared')
const whoRow = 'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 [&_a:hover]:underline'

/** Staff: who reacted to the run, and every change (changed and cleared reactions too). */
function WhoReacted({ changelogId }: { changelogId: number }) {
  const [open, setOpen] = useState(false)
  const record = useQuery({ ...reactionRecordQueryOptions(changelogId), enabled: open })
  return (
    <div className="flex flex-col gap-1.5 text-[15px]">
      <button
        type="button"
        className={cn(staffButton, 'self-start')}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? 'Hide reactions' : 'Reactions'}
      </button>
      {open &&
        (record.isPending ? (
          <span className="text-text-muted">Loading…</span>
        ) : !record.data ? (
          <span className={error}>Couldn’t load reactions.</span>
        ) : (
          <>
            {record.data.current.length ? (
              <List>
                {record.data.current.map((e) => (
                  <li key={e.profile_number} className={whoRow}>
                    <span>{reactionLabel(e.reaction)}</span>
                    <PlayerLink player={{ profileNumber: e.profile_number, name: e.user_name }} />
                    <span className="num text-text-muted">{formatDate(e.created_at)}</span>
                  </li>
                ))}
              </List>
            ) : (
              <span className="text-text-muted">No reactions yet.</span>
            )}
            {record.data.history.length > 0 && (
              <details>
                <summary className="cursor-pointer text-brand-light">
                  History ({record.data.history.length})
                </summary>
                <List>
                  {record.data.history.map((e, i) => (
                    <li key={i} className={whoRow}>
                      <span className="num text-text-muted">{formatDate(e.created_at)}</span>
                      <PlayerLink player={{ profileNumber: e.profile_number, name: e.user_name }} />
                      <span>{reactionLabel(e.reaction)}</span>
                    </li>
                  ))}
                </List>
              </details>
            )}
          </>
        ))}
    </div>
  )
}

function List({ children }: { children: ReactNode }) {
  return <ul className="m-0 flex max-h-[180px] list-none flex-col gap-0.5 overflow-y-auto p-0">{children}</ul>
}

/**
 * Notes only staff see, like runner comments: a thread on the run (a co-op run's halves share it).
 * Staff delete their own notes; admins can delete any.
 */
function StaffNotes({ changelogId }: { changelogId: number }) {
  const qc = useQueryClient()
  const user = useCurrentUser()
  const [draft, setDraft] = useState('')
  const notes = useQuery(staffNotesQueryOptions(changelogId))
  const refresh = () => qc.invalidateQueries({ queryKey: staffNotesQueryOptions(changelogId).queryKey })
  const post = useMutation({
    mutationFn: () => addStaffNote(changelogId, draft.trim()),
    onSuccess: () => {
      setDraft('')
      return refresh()
    },
  })
  const remove = useMutation({ mutationFn: deleteStaffNote, onSuccess: refresh })
  const list = notes.data ?? []
  const failure = post.error ?? remove.error
  return (
    <div className="flex flex-col gap-1.5 text-[15px]">
      <span className="font-semibold">Staff notes{list.length ? ` (${list.length})` : ''}</span>
      {notes.isPending ? (
        <span className="text-text-muted">Loading…</span>
      ) : list.length ? (
        <ul className="m-0 flex max-h-[260px] list-none flex-col gap-2 overflow-y-auto p-0">
          {list.map((n, i) => (
            <li
              key={n.id ?? `legacy-${i}`}
              className="rounded-[2px] border-l-2 border-line-strong bg-[rgba(127,127,127,0.08)] px-2 py-1.5"
            >
              <div className="flex items-baseline gap-2 text-[13px]">
                {n.author ? (
                  <PlayerLink player={{ profileNumber: n.author, name: n.author_name ?? 'Unknown' }} />
                ) : (
                  <strong>The board</strong>
                )}
                {n.created_at && (
                  <span className="num text-text-muted" title={formatDateTime(`${n.created_at}Z`)}>
                    {formatDate(`${n.created_at}Z`)}
                  </span>
                )}
                {n.id != null && (n.author === user?.profileNumber || isRoleAdmin(user)) && (
                  <button
                    type="button"
                    className={cn(staffButton, 'ml-auto')}
                    onClick={() => remove.mutate(n.id!)}
                  >
                    Delete
                  </button>
                )}
              </div>
              <p className="mt-0.5 mb-0 wrap-anywhere whitespace-pre-wrap">{n.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-text-muted">No notes yet.</span>
      )}
      <form
        className="flex items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (draft.trim()) post.mutate()
        }}
      >
        <textarea
          className={cn(input, 'h-auto flex-1 resize-y')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note (only staff see these)"
          aria-label="Staff note"
          maxLength={1000}
          rows={2}
        />
        <button type="submit" className={staffButton} disabled={post.isPending || !draft.trim()}>
          Add note
        </button>
      </form>
      {failure && <span className={error}>{failure.message}</span>}
    </div>
  )
}
