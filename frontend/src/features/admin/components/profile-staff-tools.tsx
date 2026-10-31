import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from 'cn'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useState, type ReactNode } from 'react'
import { Avatar } from '@/components/avatar'
import { CloseIcon, ShieldIcon } from '@/components/icons'
import { roundButton } from '@/components/round-button'
import { useCurrentUser } from '@/hooks/use-current-user'
import { ROLE_LABELS, type Role } from '@/lib/auth'
import { COUNTRY_LIST, countryIdByCode } from '@/lib/data/countries'
import { invalidateUser } from '@/lib/invalidate'
import {
  setProfileBanned,
  setProfileCountry,
  setProfileDisplay,
  setProfileFrozen,
  setProfileRole,
  type DisplayChanges,
} from '../api/users'
import { staffPowers, type StaffPowers, type StaffProfile } from '../utils/staff-powers'

/** Runs a staff action with the dialog's reason; resolves to whether it worked. */
type Act = (run: (reason: string | undefined) => Promise<unknown>, message: string) => Promise<boolean>

interface ToolProps {
  player: StaffProfile
  act: Act
  busy: boolean
}

const adminButton =
  'h-[34px] cursor-pointer rounded-[4px] border border-dashed border-line-strong bg-transparent px-3.5 text-[15px] whitespace-nowrap text-text-2 hover:not-disabled:border-text-muted hover:not-disabled:text-foreground disabled:cursor-default disabled:opacity-60'
const danger = 'border-solid border-hl-red text-hl-red-text'
const field =
  'h-[34px] min-w-0 flex-[1_1_200px] rounded-[4px] border border-line bg-control px-2.5 text-[15px] text-foreground'
const row = 'flex flex-wrap items-center gap-1.5'

function Section({
  title,
  locked = false,
  children,
}: {
  title: string
  locked?: boolean
  children: ReactNode
}) {
  return (
    <section>
      <h3 className="m-0 mb-2 text-[15px] font-medium text-text-2">
        {title}
        {locked && <span className="font-normal text-brand"> (set by staff)</span>}
      </h3>
      {children}
    </section>
  )
}

/**
 * Staff: a shield button opening the staff tools for this profile. A dot marks a name or picture
 * set by staff. Hidden for anyone who can't do anything here (and in view-as-player mode).
 */
export function ProfileStaffTools({ player }: { player: StaffProfile }) {
  const user = useCurrentUser()
  const [open, setOpen] = useState(false)
  const powers = staffPowers(user, player)
  if (!powers || !Object.values(powers).some(Boolean)) return null
  const locked = player.nameLocked || player.avatarLocked
  const label = `Staff tools${locked ? ' (name or picture set by staff)' : ''}`
  return (
    <>
      <button
        type="button"
        className={cn(
          roundButton,
          locked && 'after:absolute after:top-0 after:right-0 after:size-2 after:rounded-full after:bg-brand',
        )}
        onClick={() => setOpen(true)}
        title={label}
        aria-label={label}
      >
        <ShieldIcon />
      </button>
      {open && <StaffDialog player={player} powers={powers} onClose={() => setOpen(false)} />}
    </>
  )
}

function StaffDialog({
  player,
  powers,
  onClose,
}: {
  player: StaffProfile
  powers: StaffPowers
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const action = useMutation({
    mutationFn: ({ run }: { run: Parameters<Act>[0]; message: string }) => run(reason.trim() || undefined),
    onMutate: () => setMessage(null),
    onSuccess: (_, { message }) => {
      setMessage(message)
      // The profile (and every list showing the player) reloads with the result.
      void invalidateUser(qc, player.profileNumber)
    },
  })
  const busy = action.isPending
  const act: Act = (run, msg) =>
    action.mutateAsync({ run, message: msg }).then(
      () => true,
      () => false,
    )
  const props = { player, act, busy }

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/60 px-4 pt-[72px] pb-4">
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="glass w-full max-w-[640px] rounded-md border border-line bg-panel text-foreground shadow-[0_12px_40px_rgba(0,0,0,0.5)] outline-none"
          >
            <header className="flex items-center gap-2.5 rounded-t-md bg-panel-head px-4 py-3">
              <ShieldIcon className="size-6" />
              <DialogPrimitive.Title className="m-0 min-w-0 flex-1 truncate text-lg font-medium">
                Staff tools: {player.name}
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                className="inline-flex cursor-pointer border-0 bg-transparent p-1 text-text-2"
                aria-label="Close"
                disabled={busy}
              >
                <CloseIcon className="size-6" />
              </DialogPrimitive.Close>
            </header>
            <div className="flex flex-col gap-[18px] p-4">
              <label className="flex flex-col gap-1.5 text-sm text-text-muted">
                <span>Reason (audit log)</span>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  placeholder="Why, for the audit log"
                  autoFocus
                  className="h-[34px] w-full rounded-[4px] border border-line bg-control px-2.5 text-base text-foreground"
                />
              </label>
              {powers.display && <DisplayTools {...props} />}
              {powers.role && <RoleTools {...props} />}
              {(powers.freeze || powers.ban) && (
                <Section title="Restrictions">
                  <div className={row}>
                    {powers.freeze && <FreezeTools {...props} />}
                    {powers.ban && <BanTools {...props} />}
                  </div>
                </Section>
              )}
              {message && !busy && <p className="m-0 text-green">{message}</p>}
              {action.error && !busy && (
                <p className="m-0 text-sm text-hl-red-text">{action.error.message}</p>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/**
 * Moderators and admins: replace a bad name or picture (locked against Steam sign-ins and the
 * player's own changes until reset), go back to the player's Steam ones, or set their country.
 */
function DisplayTools({ player, act, busy }: ToolProps) {
  const [name, setName] = useState(player.name)
  const [url, setUrl] = useState('')
  const [country, setCountry] = useState(player.country ? String(countryIdByCode(player.country) ?? '') : '')
  const display = async (changes: DisplayChanges, message: string) => {
    if (await act((reason) => setProfileDisplay(player.profileNumber, changes, reason), message)) setUrl('')
  }
  return (
    <>
      <Section title="Name" locked={player.nameLocked}>
        <div className={row}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={32}
            aria-label="Name"
            placeholder="Name"
            className={field}
          />
          <button
            type="button"
            className={adminButton}
            disabled={busy || !name.trim()}
            onClick={() => void display({ name: name.trim() }, 'Name set.')}
          >
            Set name
          </button>
          {player.nameLocked && (
            <button
              type="button"
              className={adminButton}
              disabled={busy}
              onClick={() => void display({ name: null }, 'Back to the Steam name.')}
              title={player.steamName ? `Back to “${player.steamName}”` : undefined}
            >
              Use Steam name
            </button>
          )}
        </div>
      </Section>
      <Section title="Picture" locked={player.avatarLocked}>
        <div className={row}>
          <Avatar src={player.avatar} name={player.name} size={34} />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Steam or Imgur image address (https://…)"
            aria-label="Picture address"
            className={field}
          />
          <button
            type="button"
            className={adminButton}
            disabled={busy || !url.trim()}
            onClick={() => void display({ avatar: url.trim() }, 'Picture set.')}
          >
            Set picture
          </button>
          <button
            type="button"
            className={adminButton}
            disabled={busy}
            onClick={() => void display({ avatar: 'default' }, 'Default picture set.')}
          >
            Default picture
          </button>
          {(player.avatarLocked || player.avatarCustom) && (
            <button
              type="button"
              className={adminButton}
              disabled={busy}
              onClick={() => void display({ avatar: 'steam' }, 'Back to the Steam picture.')}
            >
              Use Steam picture
            </button>
          )}
        </div>
      </Section>
      <Section title="Country">
        <div className={row}>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            aria-label="Country"
            className="h-8 min-w-[180px] rounded-[4px] border border-line bg-control px-2 text-sm text-foreground"
          >
            <option value="">No country</option>
            {COUNTRY_LIST.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={adminButton}
            disabled={busy}
            onClick={() =>
              void act(
                (reason) => setProfileCountry(player.profileNumber, country ? Number(country) : null, reason),
                'Country set.',
              )
            }
          >
            Set country
          </button>
        </div>
      </Section>
    </>
  )
}

/** Admins: the player's staff tier (saved on change). */
function RoleTools({ player, act, busy }: ToolProps) {
  return (
    <Section title="Staff tier">
      <label className="inline-flex h-[34px] items-center gap-1.5 rounded-[4px] border border-dashed border-line-strong pr-2 pl-3 text-sm text-text-muted">
        <span>Role</span>
        <select
          value={player.role ?? ''}
          disabled={busy}
          onChange={(e) => {
            // Read now: the select goes back to the saved role until the profile reloads.
            const role = (e.target.value || null) as Role | null
            void act(() => setProfileRole(player.profileNumber, role), 'Role saved.')
          }}
          className="border-0 bg-transparent text-[15px] text-foreground"
        >
          <option value="">None</option>
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </Section>
  )
}

/** Staff: freeze (existing times stay, new ones are refused) or unfreeze the profile. */
function FreezeTools({ player, act, busy }: ToolProps) {
  return player.frozen ? (
    <button
      type="button"
      className={adminButton}
      disabled={busy}
      onClick={() => void act((reason) => setProfileFrozen(player.profileNumber, false, reason), 'Unfrozen.')}
      title="Allow new times again"
    >
      Unfreeze
    </button>
  ) : (
    <button
      type="button"
      className={adminButton}
      disabled={busy}
      onClick={() => void act((reason) => setProfileFrozen(player.profileNumber, true, reason), 'Frozen.')}
      title="Keep this player's times but refuse new ones"
    >
      Freeze profile
    </button>
  )
}

/**
 * Moderators and admins: ban a profile (all its runs leave the boards and the player is signed
 * out) after a second click, or unban it.
 */
function BanTools({ player, act, busy }: ToolProps) {
  const [confirm, setConfirm] = useState(false)
  if (player.banned) {
    return (
      <button
        type="button"
        className={adminButton}
        disabled={busy}
        onClick={() =>
          void act((reason) => setProfileBanned(player.profileNumber, false, reason), 'Unbanned.')
        }
        title="Put this player's runs back on the boards"
      >
        Unban
      </button>
    )
  }
  return confirm ? (
    <>
      <button
        type="button"
        className={cn(adminButton, danger)}
        disabled={busy}
        onClick={() =>
          void act((reason) => setProfileBanned(player.profileNumber, true, reason), 'Banned.').then(() =>
            setConfirm(false),
          )
        }
      >
        Confirm ban
      </button>
      <button type="button" className={adminButton} onClick={() => setConfirm(false)}>
        Cancel
      </button>
    </>
  ) : (
    <button
      type="button"
      className={cn(adminButton, danger)}
      disabled={busy}
      onClick={() => setConfirm(true)}
      title="Hide all of this player's runs and list them on the Wall of Shame"
    >
      Ban profile
    </button>
  )
}
