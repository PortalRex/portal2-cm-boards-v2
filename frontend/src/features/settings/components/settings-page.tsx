import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from 'cn'
import { useState, type ReactNode } from 'react'
import { Avatar } from '@/components/avatar'
import { MoreIcon } from '@/components/icons'
import { siteBackground } from '@/components/layouts/backgrounds'
import { Page } from '@/components/layouts/page'
import { Panel } from '@/components/panel'
import { Segmented } from '@/components/segmented'
import { COOP_PB_STYLES, useCoopPbStyle } from '@/hooks/use-coop-pb-style'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useReadOnly } from '@/hooks/use-read-only'
import { useTheme, type Theme } from '@/hooks/use-theme'
import { useViewAsPlayer } from '@/hooks/use-view-as-player'
import { logout, ROLE_LABELS, steamLoginUrl, type CurrentUser } from '@/lib/auth'
import { COUNTRY_LIST } from '@/lib/data/countries'
import { invalidateUser } from '@/lib/invalidate'
import { queryKeys } from '@/lib/query-keys'
import { myUserQueryOptions, setMyCountry, setMyCountryFromSteam, setMyDisplay } from '../api/settings'
import { AutoSubmitSetting } from './auto-submit-setting'

const button =
  'inline-flex h-9 cursor-pointer items-center justify-center gap-2.5 rounded-[4px] border border-line-strong bg-control px-4 text-lg whitespace-nowrap text-foreground hover:bg-control-raised disabled:cursor-default disabled:opacity-50'
const control = 'h-9 rounded-[4px] border border-line-strong bg-control px-2.5 text-foreground'
const note = 'mt-4 mb-0 max-w-[640px] text-[15px] text-text-muted'
// The theme, co-op PB and staff switches.
const switchProps = {
  className: 'h-9 upto700:w-full',
  itemClassName: 'min-w-[110px] text-[17px]',
} as const

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mt-0 mb-2.5 text-[22px] font-normal uppercase">{title}</h2>
      {children}
    </section>
  )
}

function Outcome({ message, error }: { message?: string | null; error?: Error | null }) {
  if (error) return <p className="mt-1.5 mb-0 max-w-[640px] text-base text-hl-red-text">{error.message}</p>
  if (message) return <p className="mt-1.5 mb-0 max-w-[640px] text-base text-green">{message}</p>
  return null
}

/** Settings: appearance for everyone; name, picture and country when signed in; the staff view switch. */
export function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const [pbStyle, setPbStyle] = useCoopPbStyle()
  const [, setViewAsPlayer] = useViewAsPlayer()
  const user = useCurrentUser()
  const signedIn = user && !user.sample ? user : null
  // Read-only mode: players' profile settings wait (the server refuses them anyway).
  const { blocked } = useReadOnly()
  const editable = signedIn && !blocked ? signedIn : null
  // The real staff tier, also while viewing as a player.
  const staffRole = signedIn ? (signedIn.staffRole ?? signedIn.role) : null

  return (
    <Page background={siteBackground} tint="mono" narrow>
      <Panel icon={MoreIcon} title="Settings" bodyClassName="flex flex-col gap-7 upto700:px-4">
        <Section title="Appearance">
          <Segmented<Theme>
            {...switchProps}
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
          />
          <h3 className="mt-[18px] mb-2 text-[17px] font-normal text-text-2">Co-op PBs</h3>
          <Segmented
            {...switchProps}
            label="Co-op PBs"
            value={pbStyle}
            onChange={setPbStyle}
            options={COOP_PB_STYLES}
          />
          <p className={note}>
            How a co-op run in Score Updates and on map boards marks which player set a personal best: a
            trophy by their name, or their name in their portal colour.
          </p>
        </Section>

        {editable && <DisplaySetting user={editable} />}
        {editable && <CountrySetting user={editable} />}
        {signedIn && blocked && (
          <Section title="Your profile">
            <p className="m-0 max-w-[640px] text-base text-text-2">
              Your name, picture, country and SAR auto-submit key can be changed once the boards open for
              changes.
            </p>
          </Section>
        )}
        {editable && (
          <AutoSubmitSetting
            button={button}
            note={note}
            section={(title, children) => <Section title={title}>{children}</Section>}
          />
        )}

        {signedIn && staffRole && (
          <Section title="Staff">
            <Segmented
              {...switchProps}
              label="View the site"
              value={signedIn.staffRole ? 'player' : 'staff'}
              onChange={(v) => setViewAsPlayer(v === 'player')}
              options={[
                { value: 'staff', label: `As ${ROLE_LABELS[staffRole].toLowerCase()}` },
                { value: 'player', label: 'As a player' },
              ]}
            />
            <p className={note}>
              See the site as a regular player would: staff tools, links and menus are hidden until you switch
              back (saved in this browser).
            </p>
          </Section>
        )}

        <Section title="Account">
          {signedIn ? <SignedIn user={signedIn} staffRole={staffRole} /> : <SignedOut />}
        </Section>
      </Panel>
    </Page>
  )
}

function SignedIn({ user, staffRole }: { user: CurrentUser; staffRole: CurrentUser['role'] }) {
  const qc = useQueryClient()
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span>
        Signed in through Steam as <b>{user.name}</b>
        {staffRole ? ` (${ROLE_LABELS[staffRole]})` : ''}.
      </span>
      <button
        type="button"
        className={button}
        onClick={async () => {
          // Signed out on this page even if the server couldn't be told, as legacy did.
          await logout(qc).catch(() => {})
          qc.setQueryData(queryKeys.me(), null)
        }}
      >
        Sign out
      </button>
    </div>
  )
}

function SignedOut() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-text-muted">Not signed in.</span>
      <a className={button} href={steamLoginUrl('/more/settings')}>
        Sign in through Steam
      </a>
    </div>
  )
}

/** Your name and picture: your own, or back to your Steam ones. Whatever staff set stays until they reset it. */
function DisplaySetting({ user }: { user: CurrentUser }) {
  const qc = useQueryClient()
  const me = useQuery(myUserQueryOptions(user.profileNumber)).data
  // Null while showing the saved name.
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const save = useMutation({
    mutationFn: ({ changes }: { changes: Parameters<typeof setMyDisplay>[0]; message: string }) =>
      setMyDisplay(changes),
    onSuccess: () => {
      setUrl('')
      setNameDraft(null)
      return invalidateUser(qc, user.profileNumber)
    },
  })
  if (!me) return null
  const shownName = me.board_name || me.steam_name || ''
  const name = nameDraft ?? shownName
  const busy = save.isPending
  const nameLocked = Boolean(me.name_locked)
  const avatarLocked = Boolean(me.avatar_locked)
  const locked =
    nameLocked && avatarLocked ? 'name and picture were' : nameLocked ? 'name was' : 'picture was'
  const row = 'flex flex-wrap items-center justify-start gap-2.5'
  const input = cn(control, 'w-[280px] max-w-full')

  return (
    <Section title="Name & picture">
      <div className="flex flex-nowrap items-start gap-3">
        <Avatar src={me.avatar} name={shownName} size={82} className="rounded-[4px]" />
        <div className="flex min-w-0 flex-col gap-2.5">
          <div className={row}>
            <input
              className={input}
              value={name}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={32}
              aria-label="Name"
              placeholder={me.steam_name || 'Name'}
              disabled={busy || nameLocked}
            />
            <button
              type="button"
              className={button}
              disabled={busy || nameLocked || !name.trim() || name.trim() === shownName}
              onClick={() => save.mutate({ changes: { name: name.trim() }, message: 'Name saved.' })}
            >
              Save name
            </button>
            <button
              type="button"
              className={button}
              disabled={busy || nameLocked || !me.board_name}
              title={me.board_name ? undefined : 'Already your Steam name'}
              onClick={() => save.mutate({ changes: { name: null }, message: 'Back to your Steam name.' })}
            >
              Use my Steam name
            </button>
          </div>
          <div className={row}>
            <input
              className={input}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Steam or Imgur image address (https://…)"
              aria-label="Picture address"
              disabled={busy || avatarLocked}
            />
            <button
              type="button"
              className={button}
              disabled={busy || avatarLocked || !url.trim()}
              onClick={() => save.mutate({ changes: { avatar: url.trim() }, message: 'Picture saved.' })}
            >
              Save picture
            </button>
            <button
              type="button"
              className={button}
              disabled={busy || avatarLocked}
              title="Use your current Steam picture"
              onClick={() =>
                save.mutate({ changes: { avatar: 'steam' }, message: 'Set to your current Steam picture.' })
              }
            >
              Use my Steam picture
            </button>
          </div>
        </div>
      </div>
      <p className={note}>
        {nameLocked || avatarLocked
          ? `Your ${locked} set by staff, so ${nameLocked && avatarLocked ? 'they' : 'it'} can't be changed here.`
          : 'Shown on the boards instead of your Steam name and picture. They stay when you sign in again. A picture has to be on Steam or Imgur (i.imgur.com).'}
      </p>
      <Outcome message={save.isSuccess ? save.variables.message : null} error={save.error} />
    </Section>
  )
}

/** Your country: shown on your profile with your rank in it, and on the boards' country filter. */
function CountrySetting({ user }: { user: CurrentUser }) {
  const qc = useQueryClient()
  const saved = useQuery(myUserQueryOptions(user.profileNumber)).data?.country_id
  // Null while showing the saved country.
  const [draft, setDraft] = useState<string | null>(null)
  const country = draft ?? (saved ? String(saved) : '')
  const save = useMutation({
    mutationFn: ({ fn }: { fn: () => Promise<unknown>; message: string }) => fn(),
    onSuccess: () => {
      setDraft(null)
      return invalidateUser(qc, user.profileNumber)
    },
  })
  const busy = save.isPending
  return (
    <Section title="Country">
      <div className="flex flex-wrap items-center justify-start gap-2.5">
        <select
          className={cn(control, 'min-w-[220px]')}
          value={country}
          onChange={(e) => setDraft(e.target.value)}
          disabled={busy}
          aria-label="Country"
        >
          <option value="">Not set</option>
          {COUNTRY_LIST.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() =>
            save.mutate({ fn: () => setMyCountry(country ? Number(country) : null), message: 'Saved.' })
          }
        >
          Save
        </button>
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => save.mutate({ fn: setMyCountryFromSteam, message: 'Set from your Steam profile.' })}
        >
          Use my Steam country
        </button>
      </div>
      <p className={note}>
        Shown on your profile with your rank in your country, and used for the boards' country filter.
      </p>
      <Outcome message={save.isSuccess ? save.variables.message : null} error={save.error} />
    </Section>
  )
}
