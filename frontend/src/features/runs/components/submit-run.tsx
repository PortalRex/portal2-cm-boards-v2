import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from 'cn'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useRef, useState, type FormEvent } from 'react'
import { AppLink } from '@/components/app-link'
import { CloseIcon, UploadIcon } from '@/components/icons'
import { useCurrentUser } from '@/hooks/use-current-user'
import { isRoleAdmin, type CurrentUser } from '@/lib/auth'
import { findMap, getMap, mapPath, mapsForMode, modeLabel, useCatalog, type Catalog } from '@/lib/catalog'
import { formatScore } from '@/lib/format'
import { invalidateRun } from '@/lib/invalidate'
import {
  previewDemo,
  submitRun,
  type DemoBoardMap,
  type DemoPreview,
  type SubmitResult,
} from '../api/submissions'

const field =
  'rounded-[4px] border border-line bg-control px-2.5 py-2 text-[17px] text-foreground focus:border-brand-light focus:outline-none'
const labelText = 'text-[15px] text-text-muted'
const muted = 'm-0 text-[15px] text-text-muted'
const bad = 'text-[#f08a8a] light:text-[#b42323]'
const actionButton = 'h-[38px] cursor-pointer rounded-[4px] px-[18px] text-[17px]'
const primary = cn(
  actionButton,
  'border border-brand bg-brand font-semibold text-white disabled:cursor-default disabled:opacity-45',
)
const secondary = cn(actionButton, 'border border-line-strong bg-control text-foreground')

const boardMap = (catalog: Catalog, m: DemoBoardMap) =>
  findMap(catalog, m.steam_id) ?? getMap(catalog, m.steam_id, m.game_id === 2 ? 'mel' : 'portal2')

// Map choices for admins, grouped by board. Seasons are left out: runs go on the original map
// and count for the season automatically.
const mapGroups = (catalog: Catalog) =>
  Object.values(catalog.games)
    .filter((g) => g.kind !== 'season')
    .flatMap((g) =>
      g.modes.map((mode) => ({
        mode,
        label: g.id === 'portal2' ? modeLabel(catalog, mode) : `${g.label} · ${modeLabel(catalog, mode)}`,
        maps: mapsForMode(catalog, mode),
      })),
    )

const EMPTY = { youtube: '', comment: '', map_id: '', time: '', profile_number: '', partner: '' }
type Fields = typeof EMPTY

/** The Submit Run dialog: a demo is read first (map, time, players), then submitted. */
export function SubmitRun({ onClose }: { onClose: () => void }) {
  const user = useCurrentUser()
  const catalog = useCatalog()
  const qc = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [badFile, setBadFile] = useState(false)
  const [melMode, setMelMode] = useState('story')
  const [fields, setFields] = useState<Fields>(EMPTY)
  const set = (key: keyof Fields, value: string) => setFields((f) => ({ ...f, [key]: value }))

  const read = useMutation({ mutationFn: previewDemo })
  const send = useMutation({
    mutationFn: (sendFields: Record<string, string>) => submitRun(file, sendFields),
    onSuccess: (done) =>
      invalidateRun(qc, {
        changelogId: done.changelog_id,
        profileNumbers: [fields.profile_number.trim() || user?.profileNumber, done.partner],
      }),
  })
  if (!user) return null

  const admin = isRoleAdmin(user)
  const preview = read.data ?? null
  const reading = read.isPending
  const sending = send.isPending
  const error = badFile ? 'Choose a .dem file.' : (send.error ?? read.error)?.message

  const chooseFile = (f: File) => {
    setFile(f)
    send.reset()
    read.reset()
    setBadFile(!/\.dem$/i.test(f.name))
    if (/\.dem$/i.test(f.name)) read.mutate(f)
  }

  const manual = admin && Boolean(fields.map_id || fields.time || fields.profile_number || fields.partner)
  const inDemo = preview?.players.some((p) => p.steamId === user.profileNumber) ?? false
  const demoOk =
    preview != null && preview.maps.length > 0 && (preview.timeScore ?? 0) > 0 && (inDemo || admin)
  const canSubmit = !sending && !reading && (manual ? Boolean(fields.map_id || preview) : demoOk)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const { youtube, comment, ...adminFields } = fields
    send.mutate({
      youtube,
      comment,
      mel_mode: (preview?.maps.length ?? 0) > 1 ? melMode : '',
      ...(admin ? adminFields : {}),
    })
  }
  const reset = () => {
    send.reset()
    read.reset()
    setFile(null)
    setFields(EMPTY)
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && !sending && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/60 px-4 pt-[72px] pb-4">
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="w-full max-w-[520px] rounded-md border border-line bg-card-surface text-foreground shadow-[0_12px_40px_rgba(0,0,0,0.5)] outline-none"
          >
            <header className="flex items-center justify-between rounded-t-md border-b border-line bg-card-head px-4 py-3">
              <DialogPrimitive.Title className="m-0 text-[22px] font-semibold">
                Submit run
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                className="inline-flex cursor-pointer border-0 bg-transparent p-1 text-text-muted hover:text-foreground"
                aria-label="Close"
                disabled={sending}
              >
                <CloseIcon className="size-6" />
              </DialogPrimitive.Close>
            </header>
            {send.data ? (
              <Done done={send.data} catalog={catalog} onAnother={reset} onClose={onClose} />
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-3.5 p-4">
                <DemoDrop file={file} onFile={chooseFile} busy={sending} />
                {reading && <p className={muted}>Reading demo…</p>}
                {preview && (
                  <DemoSummary
                    preview={preview}
                    melMode={melMode}
                    setMelMode={setMelMode}
                    user={user}
                    catalog={catalog}
                  />
                )}
                <label className="flex flex-col gap-1">
                  <span className={labelText}>YouTube link (optional)</span>
                  <input
                    className={field}
                    value={fields.youtube}
                    onChange={(e) => set('youtube', e.target.value)}
                    placeholder="https://youtu.be/…"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelText}>Comment (optional)</span>
                  <textarea
                    className={cn(field, 'resize-y')}
                    value={fields.comment}
                    onChange={(e) => set('comment', e.target.value)}
                    maxLength={500}
                    rows={2}
                  />
                </label>
                {admin && <AdminFields fields={fields} set={set} catalog={catalog} />}
                {error && (
                  <p
                    role="alert"
                    className="m-0 rounded-[4px] border border-[rgba(240,100,100,0.5)] bg-[rgba(240,100,100,0.12)] px-3 py-2 text-base text-[#f3a0a0] light:text-[#b42323]"
                  >
                    {error}
                  </p>
                )}
                <div className="flex justify-end gap-2.5">
                  <button type="button" className={secondary} onClick={onClose} disabled={sending}>
                    Cancel
                  </button>
                  <button type="submit" className={primary} disabled={!canSubmit}>
                    {sending ? 'Submitting…' : 'Submit'}
                  </button>
                </div>
              </form>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function DemoDrop({ file, onFile, busy }: { file: File | null; onFile: (f: File) => void; busy: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <button
      type="button"
      className={cn(
        'flex cursor-pointer flex-col items-center gap-1 rounded-md border-2 border-dashed border-line-strong bg-control px-4 py-[26px] text-center text-base break-all text-text-2 hover:border-brand-light hover:bg-control-raised',
        over && 'border-brand-light bg-control-raised',
        file && 'border-solid',
      )}
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const f = e.dataTransfer.files[0]
        if (f) onFile(f)
      }}
      disabled={busy}
    >
      <UploadIcon className="size-9 text-brand-light" />
      <strong className="text-[19px] font-semibold text-foreground">
        {file ? file.name : 'Drop your demo here'}
      </strong>
      <span className="text-text-muted">
        {file ? 'Drop another demo or click to change' : 'or click to choose a .dem file'}
      </span>
      <input
        ref={input}
        type="file"
        accept=".dem"
        hidden
        aria-label="Demo file"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
    </button>
  )
}

function DemoSummary({
  preview,
  melMode,
  setMelMode,
  user,
  catalog,
}: {
  preview: DemoPreview
  melMode: string
  setMelMode: (mode: string) => void
  user: CurrentUser
  catalog: Catalog
}) {
  const maps = preview.maps
  const chosen = maps.length > 1 ? (maps.find((m) => m.game_mode === melMode) ?? maps[0]) : maps[0]
  const map = chosen && boardMap(catalog, chosen)
  const others = preview.players.filter((p) => p.steamId !== user.profileNumber)
  const inDemo = preview.players.some((p) => p.steamId === user.profileNumber)
  const row = 'flex items-baseline gap-3'
  const term = 'flex-[0_0_64px] text-[15px] tracking-[0.05em] text-text-muted uppercase'
  const value = 'm-0 flex flex-wrap items-center gap-2.5 text-lg'
  return (
    <dl className="m-0 flex flex-col gap-2 rounded-md border border-line bg-row-alt px-3.5 py-3">
      <div className={row}>
        <dt className={term}>Map</dt>
        <dd className={value}>
          {map ? (
            <AppLink href={mapPath(map)} className="text-brand-light">
              {map.title}
            </AppLink>
          ) : (
            <span className={bad}>
              {preview.mapName ? `${preview.mapName} isn't on the boards` : 'Unknown'}
            </span>
          )}
          {map?.game === 'mel' && <span className={muted}>Mel · {modeLabel(catalog, map.mode)}</span>}
          {maps.length > 1 && (
            <span
              role="group"
              aria-label="Mel board"
              className="inline-flex overflow-hidden rounded-[4px] border border-line"
            >
              {maps.map((m) => {
                const active = m.game_mode === chosen?.game_mode
                return (
                  <button
                    key={m.game_mode}
                    type="button"
                    aria-pressed={active}
                    className={cn(
                      'cursor-pointer border-0 bg-control px-2.5 py-0.5 text-[15px] text-text-2',
                      active && 'bg-seg-active text-foreground shadow-[inset_0_-2px_0_var(--brand-light)]',
                    )}
                    onClick={() => setMelMode(m.game_mode)}
                  >
                    {modeLabel(catalog, m.game_mode)}
                  </button>
                )
              })}
            </span>
          )}
        </dd>
      </div>
      <div className={row}>
        <dt className={term}>Time</dt>
        <dd className={cn(value, 'font-semibold tabular-nums')}>
          {preview.timeScore ? (
            formatScore(preview.timeScore)
          ) : (
            <span className={bad}>No finished run in this demo</span>
          )}
        </dd>
      </div>
      {chosen?.is_coop && inDemo && (
        <div className={row}>
          <dt className={term}>Partner</dt>
          <dd className={value}>
            {others.length ? (
              others.map((p) => p.name || p.steamId).join(', ')
            ) : (
              <span className={muted}>Not found (submitted solo)</span>
            )}
          </dd>
        </div>
      )}
      {!inDemo && (
        <>
          <div className={row}>
            <dt className={term}>Players</dt>
            <dd className={value}>
              {preview.players.map((p) => p.name || p.steamId).join(', ') || (
                <span className={muted}>None found</span>
              )}
            </dd>
          </div>
          <p className="m-0 text-[15px] text-[#e8c27a] light:text-[#8a5a00]">
            {isRoleAdmin(user)
              ? "You aren't in this demo. Enter the player's SteamID below to submit it for them."
              : "You aren't in this demo. You can only submit your own runs."}
          </p>
        </>
      )}
    </dl>
  )
}

function AdminFields({
  fields,
  set,
  catalog,
}: {
  fields: Fields
  set: (key: keyof Fields, value: string) => void
  catalog: Catalog
}) {
  const label = 'mt-2.5 flex flex-col gap-1'
  return (
    <details className="flex flex-col rounded-md border border-line px-3.5 py-2.5 open:gap-2.5">
      <summary className="cursor-pointer text-[17px] text-text-2">Manual entry (admin)</summary>
      <p className={cn(muted, 'mt-2.5')}>
        Anything entered here replaces what the demo says. A demo is optional. Manual entries are recorded in
        the audit log.
      </p>
      <label className={label}>
        <span className={labelText}>Map</span>
        <select className={field} value={fields.map_id} onChange={(e) => set('map_id', e.target.value)}>
          <option value="">From the demo</option>
          {mapGroups(catalog).map((g) => (
            <optgroup key={g.mode} label={g.label}>
              {g.maps.map((m) => (
                <option key={`${m.game}:${m.id}`} value={m.id}>
                  {m.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className={label}>
        <span className={labelText}>Time</span>
        <input
          className={field}
          value={fields.time}
          onChange={(e) => set('time', e.target.value)}
          placeholder="1:23.45"
          inputMode="decimal"
        />
      </label>
      <label className={label}>
        <span className={labelText}>Player SteamID</span>
        <input
          className={field}
          value={fields.profile_number}
          onChange={(e) => set('profile_number', e.target.value)}
          placeholder="You"
          inputMode="numeric"
        />
      </label>
      <label className={label}>
        <span className={labelText}>Partner SteamID</span>
        <input
          className={field}
          value={fields.partner}
          onChange={(e) => set('partner', e.target.value)}
          placeholder="From the demo (co-op)"
          inputMode="numeric"
        />
      </label>
    </details>
  )
}

function Done({
  done,
  catalog,
  onAnother,
  onClose,
}: {
  done: SubmitResult
  catalog: Catalog
  onAnother: () => void
  onClose: () => void
}) {
  const map = findMap(catalog, done.map_id)
  // Legacy's `.sr-done p` outranked `.sr-muted`: every line here is 19px.
  const note = 'm-0 text-[19px] text-text-muted'
  return (
    <div className="flex flex-col gap-3.5 p-4">
      <p className="m-0 text-[19px]">
        <strong>{formatScore(done.score)}</strong> on{' '}
        {map ? (
          <AppLink href={mapPath(map)} onClick={onClose} className="text-brand-light">
            {done.map_name}
          </AppLink>
        ) : (
          done.map_name
        )}{' '}
        {done.waiting_for_partner ? 'has been recorded.' : 'is on the boards.'}
      </p>
      {done.waiting_for_partner && (
        <p className={note}>
          It's pending until your partner adds their demo too: they can submit it here, or add it from the
          run's details.
        </p>
      )}
      {done.boards.length > 1 && <p className={note}>Counted on: {done.boards.join(', ')}</p>}
      <div className="flex justify-end gap-2.5">
        <button type="button" className={secondary} onClick={onAnother}>
          Submit another
        </button>
        <button type="button" className={primary} onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}
