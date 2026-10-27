import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useMemo, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AppLink } from '@/components/app-link'
import { Avatar } from '@/components/avatar'
import { PlayerLink } from '@/components/player-link'
import { CloseIcon } from '@/components/icons'
import { RankNumber } from '@/components/rank'
import { Segmented } from '@/components/segmented'
import { EmptyState, ErrorState, Loading } from '@/components/status'
import { unknownPartner } from '@/lib/adapters/runs'
import { isMultiplayerMode, mapPath, useCatalog } from '@/lib/catalog'
import { stepPoints } from '@/lib/charts/steps'
import { formatDate, formatDateTime, formatDelta, formatScore, parseTimestamp } from '@/lib/format'
import { changelogQueryOptions } from '@/lib/runs/changelog'
import type { Player, Run, RunMap } from '@/types/runs'
import { BanToggle } from './ban-toggle'
import { AutorenderLink, CommentButton, DemoLink, YouTubeLink } from './run-media'

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
  const rows = runs.data ?? []

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
                  onChange={setWho}
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
                <HistoryChart rows={rows} />
                <HistoryTable
                  rows={rows}
                  game={map.game}
                  partnerOf={isMultiplayerMode(catalog, map.mode) ? (r) => partnerOf(r, who) : undefined}
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
  partnerOf,
}: {
  rows: Run[]
  game: string
  /** On a co-op map, a run's partner. */
  partnerOf?: (run: Run) => Player
}) {
  const rowGrid = cn(rowBase, partnerOf ? COOP_COLS : SP_COLS)
  return (
    <div role="table" className="mx-4 mt-2">
      <div role="row" className={cn(rowGrid, 'min-h-[26px] text-[13px] text-text-muted uppercase')}>
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
          role="row"
          className={cn(
            rowGrid,
            'min-h-[34px] text-[15px]',
            i % 2 === 0 && 'bg-row',
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

/** The player's time on the map over time (dated, unbanned runs), as a step line. */
function HistoryChart({ rows }: { rows: Run[] }) {
  const data = useMemo(
    () =>
      rows
        .filter((r) => r.timestamp && !r.banned)
        .map((r) => ({ t: parseTimestamp(r.timestamp!).getTime(), score: r.score }))
        .sort((a, b) => a.t - b.t),
    [rows],
  )
  // The line runs on to now; fixed once the dialog shows the rows.
  const [now] = useState(() => Date.now())
  if (data.length < 2) return null
  const scores = data.map((d) => d.score)
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const pad = Math.max(1, Math.round((max - min) * 0.1))
  return (
    <div className="mx-4 mt-3 mb-1">
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart
          // Each time's flat line carries it at both ends, on to now (its tooltip says when it was set).
          data={stepPoints(data, now)}
          margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id="rhFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4ea2ff" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#4ea2ff" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(t: number) => String(new Date(t).getFullYear())}
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            domain={[min - pad, max + pad]}
            ticks={min === max ? [min] : [min, max]}
            tickFormatter={(v: number) => formatScore(v)}
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={56}
            allowDataOverflow
          />
          <Tooltip
            isAnimationActive={false}
            contentStyle={{ background: 'var(--menu)', border: '1px solid var(--line)', borderRadius: 4 }}
            labelFormatter={(t, payload) => {
              const point = payload?.[0]?.payload as { setAt?: number } | undefined
              return formatDate(point?.setAt ?? Number(t))
            }}
            formatter={(v) => [formatScore(Number(v)), 'Time']}
          />
          <Area
            type="stepAfter"
            dataKey="score"
            stroke="#4ea2ff"
            strokeWidth={2}
            fill="url(#rhFill)"
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
