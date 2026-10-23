import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { Avatar } from '@/components/avatar'
import { StatsIcon } from '@/components/icons'
import { Panel } from '@/components/panel'
import { PlayerLink } from '@/components/player-link'
import { EmptyState, Loading } from '@/components/status'
import { useGame } from '@/hooks/use-game'
import { useCatalog } from '@/lib/catalog'
import { formatDate, formatLongScore, formatPoints, formatScore, timeAgo } from '@/lib/format'
import { siteStatsQueryOptions, wrStatsQueryOptions, type Leader, type SiteStats } from '../api/stats'
import { boardLabel, number, pick } from '../utils/format'
import { Figures, Intro, MapName, PlayerCell, Row, SectionTitle, StatsSwitch, Table } from './stats-ui'

/** The leader lists, in the order shown. */
const LEADERS: { key: string; title: string; note: string; format: (v: number) => string }[] = [
  { key: 'wr_held', title: 'World records held', note: 'current records, ties count', format: number },
  { key: 'wr_set', title: 'World records set', note: 'runs that took the record', format: number },
  { key: 'runs', title: 'Most runs', note: 'verified runs on the boards', format: number },
  { key: 'runs_year', title: 'Most active this year', note: 'runs in the past 365 days', format: number },
  { key: 'partners', title: 'Most co-op partners', note: 'different players run with', format: number },
  { key: 'demos', title: 'Most demos', note: 'runs submitted with a demo', format: number },
  { key: 'portals', title: 'Most portals placed', note: 'counted from demos', format: number },
  {
    key: 'time_saved',
    title: 'Most time saved',
    note: 'taken off personal bests',
    format: (v) => formatLongScore(v),
  },
  {
    key: 'record_days',
    title: 'Most days holding records',
    note: 'every map added together',
    format: (v) => number(Math.round(v)),
  },
]

/** The Stats section's first page: site-wide totals, peak points, leaders and the oldest records. */
export function RunnersPanel({
  board: boardParam,
  onBoard,
}: {
  board?: string
  onBoard: (board: string) => void
}) {
  const catalog = useCatalog()
  // The game picked under the logo.
  const game = useGame()
  const boards = [...(catalog.games[game]?.modes ?? []), 'overall']
  const board = pick(boardParam, boards, 'overall')
  const stats = useQuery(siteStatsQueryOptions(catalog, game))
  const wr = useQuery(wrStatsQueryOptions(catalog, game))
  // Record-days come from the world record stats.
  const leaders: Record<string, Leader[]> = stats.data
    ? {
        ...stats.data.leaders,
        record_days: (wr.data?.holders ?? []).slice(0, 10).map((h) => ({ player: h.player, value: h.days })),
      }
    : {}

  return (
    <Panel icon={StatsIcon} title="Runners" className="rounded-tl-none" bodyClassName="pb-9">
      {stats.isPending ? (
        <Loading label="Working out the stats" />
      ) : !stats.data ? (
        <EmptyState>Couldn’t load the stats.</EmptyState>
      ) : (
        <>
          <Totals totals={stats.data.totals} />
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionTitle className="flex-[1_1_300px]">Peak points</SectionTitle>
            <StatsSwitch
              wide
              label="Board"
              className="mb-3"
              value={board}
              onChange={(b) => onBoard(b === 'overall' ? '' : b)}
              options={boards.map((b) => ({ value: b, label: boardLabel(catalog, b) }))}
            />
          </div>
          <Intro>
            The most points each player has ever had on the board, with the day they reached it and where they
            stand now. Points fall as others pass them, so a peak is a high-water mark.
          </Intro>
          <PeakTable rows={stats.data.peaks[board] ?? []} />

          <SectionTitle>Leaders</SectionTitle>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
            {LEADERS.map((l) => (
              <LeaderCard
                key={l.key}
                title={l.title}
                note={l.note}
                rows={leaders[l.key] ?? []}
                format={l.format}
              />
            ))}
          </div>

          <SectionTitle>Longest-standing world records</SectionTitle>
          <Intro>Current records, oldest first: the time, who holds it and since when.</Intro>
          <LongestTable rows={stats.data.longestWrs} />
        </>
      )}
    </Panel>
  )
}

function Totals({ totals: t }: { totals: SiteStats['totals'] }) {
  return (
    <Figures
      items={[
        { label: 'Runners', value: number(t.runners), note: `${number(t.runnersYear)} ran this year` },
        { label: 'Runs', value: number(t.runs), note: `${number(t.runsYear)} this year` },
        { label: 'World records', value: number(t.worldRecords), note: 'set since 2012' },
        { label: 'Demos', value: number(t.demos), note: `${number(t.rendered)} autorendered` },
        { label: 'Maps', value: number(t.maps), note: 'with runs' },
        { label: 'Countries', value: number(t.countries), note: 'of ranked runners' },
      ]}
    />
  )
}

const desktop = 'upto900:hidden'

function PeakTable({ rows }: { rows: SiteStats['peaks'][string] }) {
  if (!rows.length) return <EmptyState>No points on this board yet.</EmptyState>
  return (
    <Table
      label="Peak points"
      cols="[--st-cols:44px_minmax(0,1fr)_110px_150px_110px_110px] upto900:[--st-cols:36px_minmax(0,1fr)_90px_110px]"
      head={
        <>
          <span className="text-text-muted">#</span>
          <span>Player</span>
          <span className="text-right">Peak</span>
          <span>Reached</span>
          <span className={cn('text-right', desktop)}>Now</span>
          <span className={cn('text-right', desktop)}>Change</span>
        </>
      }
    >
      {rows.map((r, i) => {
        const drop = r.current - r.points
        return (
          <Row key={r.player.profileNumber}>
            <span className="num text-text-muted">{i + 1}</span>
            <PlayerCell player={r.player} size={26} />
            <span className="num text-right font-semibold">{formatPoints(r.points)}</span>
            <span className="num">
              <Link
                to="/profile/$profileId"
                params={{ profileId: r.player.profileNumber! }}
                search={{ at: r.date }}
                title="Their profile as it was that day"
              >
                {formatDate(r.date)}
              </Link>
            </span>
            <span className={cn('num text-right', desktop)}>{formatPoints(r.current)}</span>
            <span
              className={cn('num text-right', desktop, drop < -0.05 ? 'text-[#e36b6b]' : 'text-text-muted')}
            >
              {drop < -0.05 ? formatPoints(drop) : 'at peak'}
            </span>
          </Row>
        )
      })}
    </Table>
  )
}

function LeaderCard({
  title,
  note,
  rows,
  format,
}: {
  title: string
  note: string
  rows: Leader[]
  format: (v: number) => string
}) {
  return (
    <section className="rounded-lg bg-row px-4 pt-3.5 pb-2.5" aria-label={title}>
      <h3 className="m-0 mb-2.5 flex flex-col gap-0.5 text-[19px] font-semibold">
        {title}
        <span className="text-[13px] font-normal tracking-[0.04em] text-text-muted uppercase">{note}</span>
      </h3>
      {rows.length ? (
        <ol className="m-0 list-none p-0">
          {rows.map((r, i) => (
            <li
              key={r.player.profileNumber}
              className="grid min-h-[34px] grid-cols-[30px_24px_minmax(0,1fr)_auto] items-center gap-2.5"
            >
              <span className="num text-text-muted">{i + 1}</span>
              <Avatar src={r.player.avatar} name={r.player.name} size={24} />
              <PlayerLink player={r.player} className="truncate whitespace-nowrap" />
              <span className="num font-semibold">{format(r.value)}</span>
            </li>
          ))}
        </ol>
      ) : (
        // A plain paragraph in legacy, so it keeps the browser's 1em margins.
        <p className="my-4 text-text-muted">Nothing yet.</p>
      )}
    </section>
  )
}

function LongestTable({ rows }: { rows: SiteStats['longestWrs'] }) {
  if (!rows.length) return <EmptyState>No dated records yet.</EmptyState>
  return (
    <Table
      label="Longest-standing world records"
      cols="[--st-cols:44px_minmax(0,1fr)_minmax(0,1.2fr)_110px_240px] upto900:[--st-cols:36px_minmax(0,1fr)_90px]"
      head={
        <>
          <span className="text-text-muted">#</span>
          <span>Map</span>
          <span className={desktop}>Held by</span>
          <span className="text-right">Time</span>
          <span className={desktop}>Since</span>
        </>
      }
    >
      {rows.map((r, i) => (
        <Row key={r.mapId}>
          <span className="num text-text-muted">{i + 1}</span>
          <span>
            <MapName where={r} />
            {r.isCoop && <span className="text-text-muted"> · co-op</span>}
          </span>
          <span className={cn('flex min-w-0 flex-wrap items-center gap-x-[18px] gap-y-1.5', desktop)}>
            {r.players.map((p) => (
              <span key={p.profileNumber} className="inline-flex items-center gap-2">
                <Avatar src={p.avatar} name={p.name} size={24} />
                <PlayerLink player={p} />
              </span>
            ))}
          </span>
          <span className="num text-right font-semibold">{formatScore(r.score)}</span>
          <span className={cn('num', desktop)}>
            {formatDate(r.since)} <span className="text-text-muted">({timeAgo(r.since)})</span>
          </span>
        </Row>
      ))}
    </Table>
  )
}
