import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AppLink } from '@/components/app-link'
import { Avatar } from '@/components/avatar'
import { HistoryMinimap } from '@/components/charts/history-minimap'
import { HistoryPlot, HistoryTooltip } from '@/components/charts/history-plot'
import { PlayerLink } from '@/components/player-link'
import { CloseIcon } from '@/components/icons'
import { RankNumber } from '@/components/rank'
import { Segmented } from '@/components/segmented'
import { EmptyState, ErrorState, Loading } from '@/components/status'
import { unknownPartner } from '@/lib/adapters/runs'
import { isMultiplayerMode, mapPath, useCatalog } from '@/lib/catalog'
import {
  formatWhen,
  HISTORY_MIN_SPAN,
  PLAYER_COLORS,
  playerColors,
  standingRecord,
  toSecond,
  type HistoryPoint,
} from '@/lib/charts/history'
import { formatDate, formatDateTime, formatDelta, formatScore, parseTimestamp } from '@/lib/format'
import { changelogQueryOptions } from '@/lib/runs/changelog'
import type { Player, Run, RunMap } from '@/types/runs'
import { BanToggle } from './ban-toggle'
import { AutorenderLink, CommentButton, DemoLink, ViewerLink, YouTubeLink } from './run-media'

type Person = Pick<Player, 'profileNumber' | 'name' | 'avatar'>

/**
 * A run's time as a button: clicking it (without opening the row) shows that player's history on
 * the map, like the old boards' changelog for a player and chamber. Co-op runs get a tab per player.
 * Without a score (none yet, or every run banned) it's a dash that still opens the history.
 */
export function TimeButton({
  score,
  players,
  map,
  className,
}: {
  score: number | null
  players: Person[]
  map: RunMap | null | undefined
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const people = players.filter((p): p is Person & { profileNumber: string } => Boolean(p?.profileNumber))
  const shown = score != null ? formatScore(score) : '–'
  if (!people.length || !map) return <span className={className}>{shown}</span>
  return (
    <>
      <button
        type="button"
        className={cn(
          'num cursor-pointer border-0 bg-transparent p-0 text-inherit hover:underline',
          className,
        )}
        title={`${people.map((p) => p.name).join(' & ')}'s history on ${map.title}`}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
      >
        {shown}
      </button>
      {open && <RunHistoryDialog players={people} map={map} onClose={() => setOpen(false)} />}
    </>
  )
}

function RunHistoryDialog({
  players,
  map,
  onClose,
}: {
  players: (Person & { profileNumber: string })[]
  map: RunMap
  onClose: () => void
}) {
  const catalog = useCatalog()
  const [who, setWho] = useState(players[0]!.profileNumber)
  const player = players.find((p) => p.profileNumber === who) ?? players[0]!
  const runs = useQuery(
    changelogQueryOptions(
      { profileNumber: player.profileNumber, mapId: map.id, game: map.game, banned: 'show', limit: 500 },
      catalog,
    ),
  )
  const rows = useMemo(() => runs.data ?? [], [runs.data])
  const coop = isMultiplayerMode(catalog, map.mode)
  // The run picked on the chart (its moment, in whole seconds); null: none.
  const [at, setAt] = useState<number | null>(null)
  const records = useMemo(
    () => runPoints(rows, coop ? (r) => partnerOf(r, who) : undefined),
    [rows, coop, who],
  )
  const picked = at == null ? undefined : records[standingRecord(records, at)]?.run.id

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[1000] flex cursor-default items-start justify-center overflow-y-auto bg-black/60 px-4 pt-[72px] pb-4 upto700:px-2 upto700:py-4"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="w-full max-w-[760px] rounded-md border border-line bg-panel pb-3 text-foreground shadow-[0_12px_40px_rgba(0,0,0,0.5)] outline-none"
          >
            <header className="flex items-center gap-3 rounded-t-md bg-panel-head px-4 py-3">
              <Avatar src={player.avatar} name={player.name} size={36} />
              <DialogPrimitive.Title className="m-0 min-w-0 flex-1 truncate text-lg font-medium">
                <Link
                  to="/profile/$profileId"
                  params={{ profileId: player.profileNumber }}
                  onClick={onClose}
                  className="hover:underline"
                >
                  {player.name}
                </Link>
                <span className="text-text-muted"> on </span>
                <AppLink href={mapPath(map)} onClick={onClose} className="hover:underline">
                  {map.title}
                </AppLink>
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                className="inline-flex cursor-pointer border-0 bg-transparent p-1 text-text-2"
                aria-label="Close"
              >
                <CloseIcon className="size-6" />
              </DialogPrimitive.Close>
            </header>
            {players.length > 1 && (
              <div className="mx-4 mt-3">
                <Segmented
                  size="sm"
                  value={player.profileNumber}
                  onChange={(next) => {
                    setWho(next)
                    setAt(null)
                  }}
                  label="Player"
                  options={players.map((p) => ({ value: p.profileNumber, label: p.name }))}
                />
              </div>
            )}
            {runs.isPending ? (
              <Loading />
            ) : runs.isError ? (
              <ErrorState error={runs.error} onRetry={() => void runs.refetch()} />
            ) : !rows.length ? (
              <EmptyState>No runs on record.</EmptyState>
            ) : (
              <>
                <HistoryChart
                  key={who}
                  records={records}
                  player={player.name}
                  coop={coop}
                  at={at}
                  onPick={(t) => setAt(t == null ? null : toSecond(t))}
                />
                <HistoryTable
                  rows={rows}
                  game={map.game}
                  picked={picked}
                  partnerOf={coop ? (r) => partnerOf(r, who) : undefined}
                />
              </>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/** Who the player ran a co-op run with: the other of its two players, or unknown (no demo said). */
const partnerOf = (run: Run, me: string): Player =>
  (run.players.length > 1 && run.players.find((p) => p.profileNumber !== me)) || unknownPartner()

const rowBase = 'grid items-center gap-x-3 px-2 upto700:gap-x-1.5 upto700:text-[13px]'
const SP_COLS =
  'grid-cols-[minmax(0,1fr)_110px_90px_110px_150px] upto700:grid-cols-[minmax(0,1fr)_76px_64px_72px]'
// Co-op adds the partner before the links; on phones just their picture.
const COOP_COLS =
  'grid-cols-[minmax(0,1fr)_96px_80px_100px_minmax(0,150px)_150px] upto700:grid-cols-[minmax(0,1fr)_70px_60px_64px_24px]'
// The links don't fit on phones.
const links = 'upto700:hidden'

function HistoryTable({
  rows,
  game,
  picked,
  partnerOf,
}: {
  rows: Run[]
  game: string
  /** The run picked on the chart: highlighted, and scrolled to. */
  picked?: number
  /** On a co-op map, a run's partner. */
  partnerOf?: (run: Run) => Player
}) {
  const rowGrid = cn(rowBase, partnerOf ? COOP_COLS : SP_COLS)
  const table = useRef<HTMLDivElement>(null)
  const pickedRow = useRef<HTMLDivElement>(null)
  // Scrolls the list (not the dialog, so the chart stays in view) to the picked run.
  useEffect(() => {
    const box = table.current
    const row = pickedRow.current
    if (!box || !row) return
    const view = box.getBoundingClientRect()
    const at = row.getBoundingClientRect()
    const top = view.top + (box.firstElementChild?.getBoundingClientRect().height ?? 0)
    if (at.top < top) box.scrollTop -= top - at.top
    else if (at.bottom > view.bottom) box.scrollTop += at.bottom - view.bottom
  }, [picked])
  return (
    <div role="table" ref={table} className="mx-4 mt-2 max-h-[min(60vh,560px)] overflow-y-auto">
      <div
        role="row"
        className={cn(
          rowGrid,
          'sticky top-0 z-[1] min-h-[26px] bg-panel text-[13px] text-text-muted uppercase',
        )}
      >
        <span role="columnheader">Date</span>
        <span role="columnheader" className="text-right">
          Rank
        </span>
        <span role="columnheader" className="text-right">
          Time
        </span>
        <span role="columnheader" className="text-right">
          Improvement
        </span>
        {partnerOf && (
          <span role="columnheader" className="upto700:sr-only">
            Partner
          </span>
        )}
        <span role="columnheader" className={links} />
      </div>
      {rows.map((r, i) => (
        <div
          key={r.id}
          ref={r.id === picked ? pickedRow : undefined}
          role="row"
          aria-current={r.id === picked || undefined}
          className={cn(
            rowGrid,
            'min-h-[34px] text-[15px]',
            i % 2 === 0 && 'bg-row',
            r.id === picked && 'bg-brand/15 shadow-[inset_3px_0_var(--brand)]',
            // Faded, except the staff ban switch (so it's clear which runs it would unban).
            r.banned && '[&>:not(:last-child)]:opacity-55',
          )}
        >
          <span role="cell" className="text-text-muted" title={formatDateTime(r.timestamp)}>
            {r.timestamp ? formatDate(r.timestamp) : 'Unknown date'}
            {r.banned ? (
              <span className="ml-2 rounded-[4px] bg-banned px-2 py-0.5 text-[13px] whitespace-nowrap text-banned-text">
                Banned
              </span>
            ) : (
              !r.verified && (
                <span className="ml-2 rounded-[4px] bg-pending px-3 py-1 text-[15px] tracking-[0.12em] text-pending-text uppercase">
                  Pending
                </span>
              )
            )}
          </span>
          <span role="cell" className="num text-right">
            <RankNumber rank={r.preRank} colored /> → <RankNumber rank={r.postRank} colored />
          </span>
          <strong role="cell" className="num text-right">
            {formatScore(r.score)}
          </strong>
          <span role="cell" className="num text-right text-text-muted">
            {r.scoreDelta != null ? formatDelta(r.scoreDelta, 's') : ''}
          </span>
          {partnerOf && <PartnerCell partner={partnerOf(r)} />}
          <span role="cell" className={cn('flex items-center justify-end gap-2.5', links)}>
            <CommentButton note={r.note} size={20} />
            <AutorenderLink run={r} game={game} size={20} />
            <YouTubeLink id={r.youtubeId} size={22} />
            <DemoLink demoId={r.demoId} size={20} />
            <ViewerLink demoIds={[r.demoId]} size={20} />
            <BanToggle run={r} />
          </span>
        </div>
      ))}
    </div>
  )
}

function PartnerCell({ partner }: { partner: Player }) {
  return (
    <span role="cell" className="flex min-w-0 items-center gap-2" title={partner.name}>
      <Avatar src={partner.avatar} name={partner.name} size={22} />
      <PlayerLink
        player={partner}
        className={cn('truncate upto700:hidden', partner.unknown && 'text-text-muted')}
      />
    </span>
  )
}

/** A run on the chart; on a co-op map `player` is the partner it was run with. */
interface RunPoint extends HistoryPoint {
  run: Run
}

/** The runs to chart (dated and not banned), oldest first. */
function runPoints(rows: Run[], partnerOf?: (run: Run) => Player): RunPoint[] {
  return rows
    .filter((r) => r.timestamp && !r.banned)
    .map((r) => ({
      run: r,
      t: parseTimestamp(r.timestamp!).getTime(),
      score: r.score,
      player: partnerOf ? partnerOf(r).name : '',
      gain: r.scoreDelta != null && r.scoreDelta < 0 ? -r.scoreDelta : null,
    }))
    .sort((a, b) => a.t - b.t)
}

/** A run's tooltip: when, the time and what it took off, the rank it got (and the partner). */
function RunTooltip({ point: p, color, name }: { point: RunPoint; color: string; name: string }) {
  return (
    <HistoryTooltip
      when={formatWhen(p.setAt ?? p.t)}
      name={p.player ? `with ${p.player}` : name}
      color={color}
      score={p.score}
      gain={p.gain}
    >
      <span className="num text-text-muted">
        Rank <RankNumber rank={p.run.preRank} colored /> → <RankNumber rank={p.run.postRank} colored />
        {!p.run.verified && ' · pending'}
      </span>
    </HistoryTooltip>
  )
}

/**
 * The player's time on the map over time, like a map's WR history: a dot per run, scroll to zoom,
 * drag to move along, the whole of it in small underneath. Clicking a run (or the arrow keys)
 * picks it in the list below.
 */
function HistoryChart({
  records,
  player,
  coop,
  at,
  onPick,
}: {
  records: RunPoint[]
  player: string
  coop: boolean
  at: number | null
  onPick: (t: number | null) => void
}) {
  // Co-op dots take their partner's colour; a single player's are all one.
  const colorOf = useMemo(() => (coop ? playerColors(records) : () => PLAYER_COLORS[1]!), [coop, records])
  const [zoom, setZoom] = useState<[number, number] | null>(null)
  const [keyboard, setKeyboard] = useState(false)
  // The line runs on to now; fixed once the dialog shows the rows.
  const [now] = useState(() => Date.now())
  if (records.length < 2) return null

  const full: [number, number] = [Math.min(records[0]!.t, now - HISTORY_MIN_SPAN), now]
  const [from, to] = zoom ?? full
  const inView = records.filter((r) => r.t >= from && r.t <= to).length
  return (
    <div className="mx-4 mt-3 mb-1">
      <div className="mb-1 flex min-h-6 items-center gap-2">
        <span className="mr-auto text-sm text-text-muted">
          {records.length} runs{zoom ? ` · ${inView} in view` : ''}
        </span>
        {zoom && (
          <button
            type="button"
            onClick={() => setZoom(null)}
            className="inline-flex h-6 cursor-pointer items-center rounded-[4px] border-0 bg-seg-active px-2 text-xs whitespace-nowrap text-text-2 hover:bg-control-raised-2 hover:text-foreground"
          >
            Reset zoom
          </button>
        )}
      </div>
      <HistoryPlot
        records={records}
        colorOf={colorOf}
        full={full}
        zoom={zoom}
        setZoom={setZoom}
        now={now}
        atMs={at}
        keyboard={keyboard}
        setKeyboard={setKeyboard}
        onPick={onPick}
        height={170}
        label={`${player}'s time history: click a run, then use the left and right arrow keys`}
        hint="Scroll or pinch to zoom · drag to move · click a run to find it below · arrow keys: previous / next run"
        tooltip={(p, color) => <RunTooltip point={p} color={color} name={player} />}
      />
      <HistoryMinimap records={records} full={full} zoom={zoom} onZoom={setZoom} minSpan={HISTORY_MIN_SPAN} />
    </div>
  )
}
