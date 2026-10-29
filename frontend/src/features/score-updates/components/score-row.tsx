import { cn } from 'cn'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { AppLink } from '@/components/app-link'
import { Avatar } from '@/components/avatar'
import { BannedIcon, PendingIcon, TriangleDown, TrophyFilledIcon } from '@/components/icons'
import { PlayerLink } from '@/components/player-link'
import { RankChange } from '@/components/rank'
import { TimeButton } from '@/components/runs/time-button'
import { useCoopPbStyle } from '@/hooks/use-coop-pb-style'
import { useCoopRoleOverrides } from '@/hooks/use-coop-role-overrides'
import { mapPath } from '@/lib/catalog'
import {
  coopRoles,
  NOT_PB_NAME,
  PB_NAME,
  pbColor,
  pbNameVars,
  tintFor,
  type CoopTint,
} from '@/lib/coop-roles'
import { formatDate, formatDateTime, formatDelta, formatScore, timeAgo } from '@/lib/format'
import { ageColor } from '@/lib/age-color'
import { toggleOnRowClick } from '@/lib/rows'
import type { Run } from '@/types/runs'
import { streakSummary } from '../utils/group-streaks'
import type { ScoreUpdate } from '../utils/merge-coop-halves'

const TINT_BG: Record<CoopTint, string> = {
  blue: 'bg-[linear-gradient(90deg,transparent_46px,var(--portal-blue)_46px,transparent_70%)]',
  orange: 'bg-[linear-gradient(90deg,transparent_46px,var(--portal-orange)_46px,transparent_70%)]',
  neutral: 'bg-[linear-gradient(90deg,transparent_46px,var(--portal-neutral)_46px,transparent_70%)]',
}

/** The row grid: legacy --su-cols on wide screens, two lines with grid areas on phones. */
export const SCORE_COLS =
  'grid grid-cols-(--su-cols) items-center upto900:grid-cols-[40px_minmax(0,1fr)_auto_28px] upto900:gap-x-2 upto900:[grid-template-areas:"rank_map_time_toggle""rank_players_players_toggle"]'

/**
 * A score update. With `earlier` PBs (a session of improvements folded into this, the newest) the
 * row shows the session as a whole: the rank before its first PB, and what they gained together;
 * opening it lists the earlier ones.
 */
export function ScoreRow({
  entry,
  rendered,
  renderRunDetails,
}: {
  entry: ScoreUpdate & { earlier?: ScoreUpdate[] }
  rendered: Map<number, string>
  renderRunDetails?: (run: Run, rendered: Map<number, string>) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const earlier = entry.earlier ?? []
  const { preRank, scoreDelta, pointsDelta } = earlier.length ? streakSummary({ ...entry, earlier }) : entry
  const { players, rolesKnown } = coopRoles(entry, useCoopRoleOverrides())
  const [pbStyle] = useCoopPbStyle()
  const coop = players.length > 1
  const pbs = coop ? (entry.pbs ?? []) : []
  const anyPbMarked = pbStyle === 'border' && pbs.length > 0

  return (
    <div className="group/row mt-0.5 bg-row" data-testid="score-row" data-open={open || undefined}>
      <div
        className={cn(SCORE_COLS, 'min-h-[46px] cursor-pointer upto900:min-h-10 upto900:pb-1')}
        onClick={toggleOnRowClick(() => setOpen((o) => !o))}
      >
        <div
          className={cn(
            'col-span-2 self-stretch upto900:col-auto upto900:[grid-area:rank]',
            // Phones: only the new rank.
            'upto900:[&>div]:min-h-10 upto900:[&>div]:grid-cols-1 upto900:[&>div]:text-[15px] upto900:[&>div>:first-child]:hidden upto900:[&>div>svg]:hidden',
          )}
        >
          <RankChange pre={preRank} post={entry.postRank} />
        </div>

        {/* Only the name links to the map; the rest of the row opens the run. */}
        <div
          className="relative flex flex-col justify-center self-stretch overflow-hidden px-5 [background:linear-gradient(90deg,rgb(var(--row-rgb)/0.55),var(--row)_95%),var(--map-image,none)_center/cover_no-repeat] upto900:px-0 upto900:py-0.5 upto900:[background:none] upto900:[grid-area:map]"
          style={
            entry.map.image ? ({ '--map-image': `url("${entry.map.image}")` } as CSSProperties) : undefined
          }
        >
          <AppLink
            href={mapPath(entry.map)}
            className="max-w-full self-start truncate text-lg leading-[1.1] hover:underline upto900:text-[15px]"
          >
            {entry.map.title}
          </AppLink>
          <span className="text-[13px] whitespace-nowrap text-text-2 uppercase upto900:hidden">
            {entry.map.chapter}
          </span>
          <span
            className="hidden text-xs text-text-muted upto900:block"
            title={formatDateTime(entry.timestamp)}
            style={{ color: ageColor(entry.timestamp) }}
          >
            {timeAgo(entry.timestamp)}
          </span>
        </div>

        <div
          className={cn(
            'flex flex-col self-stretch upto900:min-w-0 upto900:flex-row upto900:flex-wrap upto900:items-center upto900:gap-x-2.5 upto900:gap-y-0.5 upto900:[grid-area:players]',
            coop && 'min-[1200px]:flex-row',
          )}
        >
          {players.map((p, i) => {
            // Marked (trophy, or their name coloured): this player set a PB with the run.
            const pb = coop
              ? pbs.find((x) => x.profileNumber && x.profileNumber === p.profileNumber)
              : undefined
            const tint = tintFor(rolesKnown, i)
            const title = [
              pb &&
                `${p.name} set a PB${pb.scoreDelta != null ? ` (${formatDelta(pb.scoreDelta, 's')})` : ''}${
                  pb.postRank ? `, rank ${pb.preRank ?? '–'} → ${pb.postRank}` : ''
                }`,
              coop && !rolesKnown && 'Unknown which player was blue',
            ]
              .filter(Boolean)
              .join('. ')
            const marked = Boolean(pb) && pbStyle === 'border'
            return (
              <div
                key={i}
                title={title || undefined}
                data-tint={coop ? tint : undefined}
                className={cn(
                  'flex min-h-[46px] min-w-0 flex-1 items-center gap-4',
                  coop && TINT_BG[tint],
                  coop && 'min-[1200px]:flex-[1_1_0]',
                  'upto900:min-h-0 upto900:max-w-full upto900:flex-none upto900:gap-[5px] upto900:bg-none!',
                )}
              >
                <Avatar src={p.avatar} name={p.name} size={46} className="upto900:size-[18px]!" />
                <PlayerLink
                  player={p}
                  className={cn(
                    'truncate text-lg upto900:text-[13px]',
                    coop && 'min-[1200px]:text-[17px]',
                    marked && PB_NAME,
                    anyPbMarked && !pb && NOT_PB_NAME,
                  )}
                  style={marked ? pbNameVars(tint) : undefined}
                />
                {pb && pbStyle === 'icon' && (
                  <TrophyFilledIcon
                    role="img"
                    aria-label="PB"
                    className="mr-2.5 ml-auto size-[17px] shrink-0"
                    style={{ color: pbColor(tint) }}
                  />
                )}
              </div>
            )
          })}
        </div>

        <div className="num px-2.5 text-right text-lg font-semibold upto900:p-0 upto900:text-[15px] upto900:[grid-area:time]">
          <TimeButton score={entry.score} players={players} map={entry.map} />
          {scoreDelta != null && (
            <span className="hidden font-normal text-text-muted upto900:inline">
              {' '}
              ({formatDelta(scoreDelta, 's')})
            </span>
          )}
          {earlier.length > 0 && (
            <span className="block text-[13px] leading-tight font-normal text-text-muted">
              +{earlier.length} earlier PB{earlier.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <div className="num px-2.5 text-right text-lg text-text-2 upto900:hidden">
          {scoreDelta != null ? formatDelta(scoreDelta, 's') : ''}
        </div>
        <div className="num px-2.5 text-right text-lg text-text-2 upto900:hidden">
          {pointsDelta != null ? `${pointsDelta > 0 ? '+' : ''}${pointsDelta}` : ''}
        </div>
        <div className="flex flex-col items-end px-2.5 text-lg leading-[1.1] upto900:hidden">
          <span
            className="text-text-muted"
            title={formatDateTime(entry.timestamp)}
            style={{ color: ageColor(entry.timestamp) }}
          >
            {timeAgo(entry.timestamp)}
          </span>
          <span className="num text-[13px] text-text-muted">{formatDate(entry.timestamp)}</span>
        </div>
        {/* A pending / banned icon. */}
        <div className="flex items-center justify-center upto900:hidden">
          {entry.banned ? (
            <StatusIcon label="Banned" title="Banned" className="bg-banned text-banned-text">
              <BannedIcon className="size-4" />
            </StatusIcon>
          ) : (
            !entry.verified && (
              <StatusIcon
                label="Pending"
                title="Pending verification"
                className="bg-pending text-pending-text"
              >
                <PendingIcon className="size-4" />
              </StatusIcon>
            )
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? 'Hide details' : 'Show details'}
          className="inline-flex size-8 cursor-pointer items-center justify-center justify-self-center border-0 bg-transparent transition-transform group-data-[open]/row:rotate-180 upto900:[grid-area:toggle]"
        >
          <TriangleDown size={14} />
        </button>
      </div>

      {open && earlier.length > 0 && (
        <EarlierPbs runs={earlier} rendered={rendered} renderRunDetails={renderRunDetails} />
      )}
      {open && renderRunDetails?.(entry, rendered)}
    </div>
  )
}

/** The session's earlier PBs, newest first, each opening its own run details as the row does. */
function EarlierPbs({
  runs,
  rendered,
  renderRunDetails,
}: {
  runs: ScoreUpdate[]
  rendered: Map<number, string>
  renderRunDetails?: (run: Run, rendered: Map<number, string>) => ReactNode
}) {
  return (
    <div className="px-5 pt-1 pb-2 upto900:px-2">
      <h3 className="m-0 mb-1 text-sm font-normal tracking-[0.04em] text-text-muted uppercase">
        Earlier PBs this session
      </h3>
      <ol className="m-0 list-none p-0" aria-label="Earlier PBs this session">
        {runs.map((r) => (
          <EarlierPb key={r.id} run={r} rendered={rendered} renderRunDetails={renderRunDetails} />
        ))}
      </ol>
    </div>
  )
}

// The ranks as the main rows show them (only the new one on phones), then when, the time, what it
// took off, and the arrow.
const EARLIER_COLS =
  'grid grid-cols-[140px_minmax(0,1fr)_auto_80px_40px] items-center gap-x-3 upto900:grid-cols-[40px_minmax(0,1fr)_auto_auto_28px] upto900:gap-x-2'

function EarlierPb({
  run,
  rendered,
  renderRunDetails,
}: {
  run: ScoreUpdate
  rendered: Map<number, string>
  renderRunDetails?: (run: Run, rendered: Map<number, string>) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <li className="group/pb mt-0.5" data-open={open || undefined}>
      <div
        className={cn(EARLIER_COLS, 'min-h-9 cursor-pointer bg-row-sub text-[15px] upto900:text-sm')}
        onClick={toggleOnRowClick(() => setOpen((o) => !o))}
      >
        <div className="self-stretch [&>div]:min-h-9 [&>div]:text-base upto900:[&>div]:grid-cols-1 upto900:[&>div]:text-sm upto900:[&>div>:first-child]:hidden upto900:[&>div>svg]:hidden">
          <RankChange pre={run.preRank} post={run.postRank} />
        </div>
        <span
          className="text-text-muted"
          title={formatDateTime(run.timestamp)}
          style={{ color: ageColor(run.timestamp) }}
        >
          {timeAgo(run.timestamp)}
        </span>
        <span className="num text-right font-semibold">{formatScore(run.score)}</span>
        <span className="num text-right text-text-muted">
          {run.scoreDelta != null ? formatDelta(run.scoreDelta, 's') : ''}
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? 'Hide details' : 'Show details'}
          className="inline-flex size-8 cursor-pointer items-center justify-center justify-self-center border-0 bg-transparent transition-transform group-data-[open]/pb:rotate-180"
        >
          <TriangleDown size={12} />
        </button>
      </div>
      {open && renderRunDetails?.(run, rendered)}
    </li>
  )
}

function StatusIcon({
  label,
  title,
  className,
  children,
}: {
  label: string
  title: string
  className: string
  children: ReactNode
}) {
  return (
    <span
      role="img"
      aria-label={label}
      title={title}
      className={cn(
        'col-start-2 inline-grid size-6 place-items-center rounded-full upto1400:size-[22px]',
        className,
      )}
    >
      {children}
    </span>
  )
}
