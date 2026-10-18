import { cn } from 'cn'
import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AppLink } from '@/components/app-link'
import { Flag } from '@/components/avatar'
import { Bubble } from '@/components/bubble'
import { bubbleAnchor } from '@/lib/bubble'
import { GlobeIcon, PeakIcon, SparkleIcon, TrophyIcon } from '@/components/icons'
import { Card } from '@/components/panel'
import { countryName } from '@/lib/data/countries'
import { roleProgress, type PointsBoard } from '@/lib/data/roles'
import { formatDate, formatDateTime, formatPoints, formatScore, ordinalSuffix, timeAgo } from '@/lib/format'
import { rankVars } from '@/lib/ranks'
import type { MapScore, PointsPeak, Profile, ScoreBrief } from '../types'
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
  const text =
    'reached' in prog
      ? `${prog.reached} threshold reached`
      : `${prog.missing.toLocaleString()} points to ${prog.next}: ${prog.percent}%`
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
      className="relative mt-2.5 block w-[min(102px,90%)] cursor-help py-1 outline-none"
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

const BOARDS: { key: PointsBoard; label: string; short: string }[] = [
  { key: 'sp', label: 'Singleplayer', short: 'Single Player' },
  { key: 'coop', label: 'Cooperative', short: 'Cooperative' },
  { key: 'overall', label: 'Overall', short: 'Overall' },
]

export function PointsCard({ profile }: { profile: Profile }) {
  return (
    <Card
      icon={SparkleIcon}
      title="Challenge Mode Points"
      collapseId="profile.points"
      bodyClassName="flex items-center upto800:justify-around"
    >
      <div className={statRow}>
        {BOARDS.map(({ key, label }) => (
          <Stat key={key} value={formatPoints(profile.points[key])} label={label}>
            <RoleBar board={key} points={profile.points[key] || 0} />
          </Stat>
        ))}
      </div>
    </Card>
  )
}

const TALL = 'min-[1201px]:not-data-collapsed:min-h-[366px]'

/** Places on each board and in the country, each linking to its board on this player's page. */
export function GlobalRankCard({ profile, chart }: { profile: Profile; chart?: ReactNode }) {
  const { globalRank: rank, player } = profile
  const board = (b: PointsBoard) => (rank[b] ? `/leaderboard/${b}?player=${player.profileNumber}` : undefined)
  return (
    <Card icon={GlobeIcon} title="Global Rank" collapseId="profile.rank" className={TALL}>
      <div className={cn(statRow, 'h-auto pt-2.5 upto800:grid-flow-row upto800:grid-cols-2 upto800:gap-y-4')}>
        {BOARDS.map(({ key, label }) => (
          <Stat key={key} value={<Ordinal n={rank[key]} colored />} label={label} to={board(key)} />
        ))}
        <Stat
          to={
            rank.country && player.country
              ? `/leaderboard/overall?country=${player.country}&player=${player.profileNumber}`
              : undefined
          }
          value={
            <>
              <Ordinal n={rank.country} colored />
              <span className="ml-1.5 self-center">
                <Flag code={player.country} height={18} />
              </span>
            </>
          }
          label={`In ${countryName(player.country) || 'country'}`}
        />
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
      <span className={valueClass('md')}>
        {entry?.score != null ? formatScore(entry.score) : '–'}
        {entry?.score != null && <small>s</small>}
      </span>
      {entry && (
        <span className="text-base uppercase">
          on <b className="font-semibold">{entry.map.title}</b>
        </span>
      )}
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

function PlaceStat({ label, entry }: { label: string; entry: MapScore | null }) {
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <StatHead label={label} />
      <span className={valueClass('md')}>
        <Ordinal n={entry?.rank} />
      </span>
      {entry && (
        <span className="text-base uppercase">
          on <b className="font-semibold">{entry.map.title}</b>
        </span>
      )}
    </div>
  )
}

export function StatisticsCard({ profile }: { profile: Profile }) {
  return (
    // Legacy's card shared the Stats tab's .pf-stats class, which put a 24 px gap under its header.
    <Card icon={SparkleIcon} title="Statistics" collapseId="profile.stats" className={cn(TALL, 'gap-6')}>
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-[26px] py-3">
        <ScoreStat label="Newest score" entry={profile.newest} green />
        <ScoreStat label="Oldest score" entry={profile.oldest} />
        <PlaceStat label="Best place" entry={profile.best} />
        <PlaceStat label="Worst place" entry={profile.worst} />
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
  icon: typeof GlobeIcon
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

/** Average place, world records and peak points, stacked beside Global Rank and Statistics. */
export function SideCards({ profile, peak }: { profile: Profile; peak: PointsPeak | null }) {
  const { averagePlace: avg, worldRecords: wrs } = profile
  return (
    <div className="flex flex-col gap-3 upto1200:grid upto1200:grid-cols-2 upto800:grid-cols-1">
      <SideCard icon={SparkleIcon} title="Average Place" collapseId="profile.average">
        {BOARDS.map(({ key, short }) => (
          <Stat key={key} size="sm" value={fmtAvg(avg[key])} label={short} />
        ))}
      </SideCard>
      <SideCard icon={TrophyIcon} title="World Records" collapseId="profile.wrs">
        <Stat size="sm" value={wrs.sp} label="Single Player" />
        <Stat size="sm" value={wrs.coop} label="Cooperative" />
        <Stat size="sm" value={wrs.sp + wrs.coop} label="Overall" />
      </SideCard>
      {/* Highest points the player has ever had per board, with the date it was reached. */}
      <SideCard icon={PeakIcon} title="Peak Points" collapseId="profile.peak">
        {BOARDS.map(({ key, short }) => {
          const v = peak?.[key]
          return (
            <Stat key={key} size="sm" value={v ? Math.round(v.points) : '–'} label={short}>
              {v && (
                <span className="num mt-0.5 text-[11px] leading-[13px] text-text-muted">
                  {formatDate(v.date)}
                </span>
              )}
            </Stat>
          )
        })}
      </SideCard>
    </div>
  )
}
