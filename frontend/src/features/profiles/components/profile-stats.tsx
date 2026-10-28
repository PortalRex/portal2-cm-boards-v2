import { cn } from 'cn'
import { useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react'
import { AppLink } from '@/components/app-link'
import { Flag } from '@/components/avatar'
import { Bubble } from '@/components/bubble'
import { bubbleAnchor } from '@/lib/bubble'
import { mapPath } from '@/lib/catalog'
import { GlobeIcon, PeakIcon, SparkleIcon, TrophyFilledIcon } from '@/components/icons'
import { Card } from '@/components/panel'
import { countryName } from '@/lib/data/countries'
import { roleProgress, roleProgressText, type PointsBoard } from '@/lib/data/roles'
import { formatDate, formatDateTime, formatPoints, formatScore, ordinalSuffix, timeAgo } from '@/lib/format'
import { rankVars } from '@/lib/ranks'
import type { MapScore, PointsPeak, ProfilePlayer, ScoreBrief } from '../types'
import type { ProfileSummary } from '../utils/summary'
import { isRecent } from '../utils/tables'

type StatSize = 'md' | 'sm'

const statRow = 'grid h-full auto-cols-fr grid-flow-col items-center gap-3'
const labelClass = (size: StatSize, className?: string) =>
  cn(
    'max-w-full truncate font-light whitespace-nowrap text-text-2 uppercase',
    size === 'sm' ? 'text-[13px] leading-4' : 'text-lg upto800:text-sm',
    className,
  )
const valueClass = (size: StatSize) =>
  cn(
    'num inline-flex items-baseline gap-0.5 font-medium [&_small]:text-[22px] [&_small]:font-normal',
    size === 'sm' ? 'text-[28px] leading-[31px]' : 'text-4xl leading-[1.1] upto800:text-[28px]',
  )

/** A number with its label; with `to`, a link (e.g. a rank to its leaderboard). */
function Stat({
  value,
  label,
  to,
  size = 'md',
  children,
}: {
  value: ReactNode
  label: string
  to?: string
  size?: StatSize
  children?: ReactNode
}) {
  const body = (
    <>
      <span className={valueClass(size)}>{value}</span>
      <span className={labelClass(size)} title={label}>
        {label}
      </span>
    </>
  )
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      {to ? (
        <AppLink
          href={to}
          className="contents [&:hover>span:last-child]:underline"
          title={`See the ${label.toLowerCase()} leaderboard`}
        >
          {body}
        </AppLink>
      ) : (
        body
      )}
      {children}
    </div>
  )
}

/** A rank as "20th"; `colored` uses the rank colours the boards use elsewhere. */
function Ordinal({ n, colored = false }: { n: number | null | undefined; colored?: boolean }) {
  if (!n) return <>–</>
  const text = (
    <>
      {n}
      <small>{ordinalSuffix(n)}</small>
    </>
  )
  return colored ? (
    <span className="rank-tint" style={rankVars(n)}>
      {text}
    </span>
  ) : (
    text
  )
}

/** Progress toward the next community role on a board; hover (or focus) shows how far off it is. */
function RoleBar({ board, points }: { board: PointsBoard; points: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const prog = roleProgress(board, points)
  const text = roleProgressText(board, prog)
  const show = () => setAt(bubbleAnchor(ref.current, 110))
  return (
    <span
      ref={ref}
      tabIndex={0}
      aria-label={text}
      onMouseEnter={show}
      onMouseLeave={() => setAt(null)}
      onFocus={show}
      onBlur={() => setAt(null)}
      className="relative mt-2.5 block w-[min(102px,90%)] py-1 outline-none"
    >
      {/* Filled in the colour of the role already reached on this board (grey before the first). */}
      <span className="block h-2.5 w-full overflow-hidden rounded-[5px] bg-[#d7dcdb]">
        <span
          className={cn(
            'block h-full bg-(--role)',
            prog.current && 'light:bg-[color-mix(in_srgb,var(--role)_78%,#000)]',
          )}
          style={
            {
              width: `${Math.min(100, prog.percent)}%`,
              '--role': prog.current?.color ?? 'var(--text-muted)',
            } as CSSProperties
          }
        />
      </span>
      {at && <Bubble at={at}>{text}</Bubble>}
    </span>
  )
}

/** The points on each of the game's boards; Portal 2's with the progress toward the next role. */
export function PointsCard({ summary }: { summary: ProfileSummary }) {
  return (
    <Card
      icon={SparkleIcon}
      title="Challenge Mode Points"
      collapseId="profile.points"
      bodyClassName="flex items-center upto800:justify-around"
    >
      <div className={statRow}>
        {summary.slots.map(({ key, label, roleBoard }) => (
          <Stat key={key} value={formatPoints(summary.points[key] ?? 0)} label={label}>
            {roleBoard && <RoleBar board={roleBoard} points={summary.points[key] || 0} />}
          </Stat>
        ))}
      </div>
    </Card>
  )
}

const TALL = 'min-[1201px]:not-data-collapsed:min-h-[366px]'

/**
 * Places on each of the game's boards, each linking to its board on this player's page, and (on
 * Portal 2's overall board) in the player's country.
 */
export function GlobalRankCard({
  summary,
  player,
  chart,
}: {
  summary: ProfileSummary
  player: ProfilePlayer
  chart?: ReactNode
}) {
  const rank = summary.place
  return (
    <Card icon={GlobeIcon} title="Global Rank" collapseId="profile.rank" className={TALL}>
      <div className={cn(statRow, 'h-auto pt-2.5 upto800:grid-flow-row upto800:grid-cols-2 upto800:gap-y-4')}>
        {summary.slots.map((slot) => (
          <Stat
            key={slot.key}
            value={<Ordinal n={rank[slot.key]} colored />}
            label={slot.label}
            to={rank[slot.key] ? slot.href(player.profileNumber) : undefined}
          />
        ))}
        {summary.slots[0]?.roleBoard && (
          <Stat
            to={
              summary.countryPlace && player.country
                ? `/leaderboard/overall?country=${player.country}&player=${player.profileNumber}`
                : undefined
            }
            value={
              <>
                <Ordinal n={summary.countryPlace} colored />
                <span className="ml-1.5 self-center">
                  <Flag code={player.country} height={18} />
                </span>
              </>
            }
            label={`In ${countryName(player.country) || 'country'}`}
          />
        )}
      </div>
      {chart}
    </Card>
  )
}

function StatHead({ label }: { label: string }) {
  return (
    <span className={labelClass('md', 'text-xl upto800:text-xl')} title={label}>
      {label}
    </span>
  )
}

function ScoreStat({
  label,
  entry,
  green = false,
}: {
  label: string
  entry: ScoreBrief | null
  green?: boolean
}) {
  const recent = isRecent(entry?.timestamp)
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <StatHead label={label} />
      <OnMap map={entry?.map}>
        <span className={valueClass('md')}>
          {entry?.score != null ? formatScore(entry.score) : '–'}
          {entry?.score != null && <small>s</small>}
        </span>
      </OnMap>
      {entry?.timestamp && (
        // Green while it's recent (the past week), grey after.
        <span
          className={cn('text-sm uppercase', green && recent ? 'text-green' : 'text-text-muted')}
          title={formatDateTime(entry.timestamp)}
        >
          {timeAgo(entry.timestamp)}
        </span>
      )}
    </div>
  )
}

/** A value with "on <map>" under it, linking to the map's page when the map is known. */
function OnMap({ map, children }: { map: ScoreBrief['map'] | undefined; children: ReactNode }) {
  if (!map) return <>{children}</>
  const body = (
    <>
      {children}
      <span className="text-base uppercase">
        on <b className="font-semibold">{map.title}</b>
      </span>
    </>
  )
  return map.id && map.mode ? (
    <AppLink
      href={mapPath({ id: map.id, mode: map.mode })}
      className="flex flex-col items-center [&:hover_b]:underline"
      title={`Open ${map.title}`}
    >
      {body}
    </AppLink>
  ) : (
    body
  )
}

/** A place on one map (linking to it), or on how many maps share it. */
function PlaceStat({ label, entry, count }: { label: string; entry: MapScore | null; count: number }) {
  const place = (
    <span className={valueClass('md')}>
      <Ordinal n={entry?.rank} />
    </span>
  )
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <StatHead label={label} />
      {count > 1 ? (
        <>
          {place}
          <span className="text-base uppercase">
            on <b className="font-semibold">{count} maps</b>
          </span>
        </>
      ) : (
        <OnMap map={entry?.map}>{place}</OnMap>
      )}
    </div>
  )
}

export function StatisticsCard({ summary }: { summary: ProfileSummary }) {
  return (
    // Legacy's card shared the Stats tab's .pf-stats class, which put a 24 px gap under its header.
    <Card icon={SparkleIcon} title="Statistics" collapseId="profile.stats" className={cn(TALL, 'gap-6')}>
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-[26px] py-3">
        <ScoreStat label="Newest score" entry={summary.newest} green />
        <ScoreStat label="Oldest score" entry={summary.oldest} />
        <PlaceStat label="Best place" entry={summary.best} count={summary.bestCount} />
        <PlaceStat label="Worst place" entry={summary.worst} count={summary.worstCount} />
      </div>
    </Card>
  )
}

const fmtAvg = (v: number | null) => (v == null ? '–' : v.toFixed(1))

/** Compact cards so three fit beside Global Rank and Statistics. */
function SideCard({
  icon,
  title,
  collapseId,
  children,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  collapseId: string
  children: ReactNode
}) {
  return (
    <Card
      icon={icon}
      title={title}
      collapseId={collapseId}
      headClassName="h-10 [&_h3]:text-base"
      bodyClassName="px-4 pt-2.5 pb-3"
    >
      <div className={statRow}>{children}</div>
    </Card>
  )
}

/**
 * Average place, world records and peak points, stacked beside Global Rank and Statistics. A peak
 * opens the profile as it was on the day it was reached (`onPickDay`), as the chart's peaks do.
 */
export function SideCards({
  summary,
  peak,
  onPickDay,
}: {
  summary: ProfileSummary
  peak: PointsPeak | null
  onPickDay?: (day: string) => void
}) {
  const { averagePlace: avg, worldRecords: wrs } = summary
  return (
    <div className="flex flex-col gap-3 upto1200:grid upto1200:grid-cols-2 upto800:grid-cols-1">
      <SideCard icon={SparkleIcon} title="Average Place" collapseId="profile.average">
        {summary.slots.map(({ key, short }) => (
          <Stat key={key} size="sm" value={fmtAvg(avg[key] ?? null)} label={short} />
        ))}
      </SideCard>
      <SideCard icon={TrophyFilledIcon} title="World Records" collapseId="profile.wrs">
        {summary.slots.map(({ key, short }) => (
          <Stat key={key} size="sm" value={wrs[key] ?? 0} label={short} />
        ))}
      </SideCard>
      {/* Highest points the player has ever had per board, with the date it was reached. */}
      <SideCard icon={PeakIcon} title="Peak Points" collapseId="profile.peak">
        {summary.slots.map(({ key, short }) => {
          const v = peak?.[key]
          const stat = (
            <Stat size="sm" value={v ? Math.round(v.points) : '–'} label={short}>
              {v && (
                <span className="num mt-0.5 text-[11px] leading-[13px] text-text-muted">
                  {formatDate(v.date)}
                </span>
              )}
            </Stat>
          )
          if (!v || !onPickDay) return <div key={key}>{stat}</div>
          return (
            <button
              key={key}
              type="button"
              onClick={() => onPickDay(v.date)}
              title={`See the profile on ${formatDate(v.date)}, the day it peaked`}
              className="min-w-0 cursor-pointer rounded-[4px] border-0 bg-transparent p-0 text-inherit hover:bg-seg-hover"
            >
              {stat}
            </button>
          )
        })}
      </SideCard>
    </div>
  )
}
