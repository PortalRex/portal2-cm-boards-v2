import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { cn } from 'cn'
import { useState, type ReactNode } from 'react'
import { AppLink } from '@/components/app-link'
import { Avatar } from '@/components/avatar'
import { HistoryIcon } from '@/components/icons'
import { Panel } from '@/components/panel'
import { PlayerLink } from '@/components/player-link'
import { RankNumber } from '@/components/rank'
import { TimeButton } from '@/components/runs/time-button'
import { EmptyState, ErrorState, Loading } from '@/components/status'
import { useFollows } from '@/hooks/use-follows'
import { mapPath, useCatalog } from '@/lib/catalog'
import { formatDate, formatDateTime, formatDelta, timeAgo } from '@/lib/format'
import type { Player, Run } from '@/types/runs'
import {
  dailyChambersQueryOptions,
  followingFeedQueryOptions,
  weeklyRecapQueryOptions,
  type DailyChambers as DailyData,
  type WeeklyRecap as RecapData,
} from '../api/panels'
import { PanelSwitch, Pager } from './panel-controls'

const DAY_MS = 24 * 3600 * 1000
const WEEK_MS = 7 * DAY_MS

type Tab = 'recap' | 'daily' | 'following'
const TABS: { value: Tab; label: string; title: string }[] = [
  { value: 'recap', label: 'Weekly', title: 'Weekly Recap' },
  { value: 'daily', label: 'Daily', title: 'Daily Chambers' },
  { value: 'following', label: 'Following', title: 'Following' },
]

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })

/**
 * Weekly recap (the week's top 5 runs), daily chambers (one map per board each day) and the players
 * you follow, as tabs. Recap and daily page back through past weeks / days.
 */
export function RecapPanel({ game }: { game: string }) {
  const catalog = useCatalog()
  const [tab, setTab] = useState<Tab>('recap')
  const [weekOffset, setWeekOffset] = useState(0)
  const [dayOffset, setDayOffset] = useState(0)
  // "Now" for the pagers, fixed for the page view (legacy read Date.now() on each request).
  const [now] = useState(() => Date.now())
  const recap = useQuery({
    ...weeklyRecapQueryOptions(game, new Date(now - weekOffset * WEEK_MS), catalog),
    enabled: tab === 'recap',
    placeholderData: keepPreviousData,
  })
  const daily = useQuery({
    ...dailyChambersQueryOptions(game, new Date(now - dayOffset * DAY_MS), catalog),
    enabled: tab === 'daily',
    placeholderData: keepPreviousData,
  })
  const weekRange =
    recap.data &&
    `${shortDate(recap.data.start)} – ${shortDate(new Date(Date.parse(`${recap.data.end}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10))}`
  // While another week loads, the previous week's data is still there: don't label it as the new one.
  const pager =
    tab === 'recap'
      ? {
          offset: weekOffset,
          set: setWeekOffset,
          label: weekOffset === 0 ? 'This week' : (!recap.isPlaceholderData && weekRange) || '…',
          unit: 'week',
        }
      : tab === 'daily'
        ? {
            offset: dayOffset,
            set: setDayOffset,
            label:
              dayOffset === 0
                ? 'Today'
                : !daily.isPlaceholderData && daily.data
                  ? shortDate(daily.data.date)
                  : '…',
            unit: 'day',
          }
        : null

  const actions = (
    <div className="flex items-center gap-3.5 normal-case upto600:w-full upto600:flex-wrap upto600:justify-between upto600:gap-y-2">
      <PanelSwitch value={tab} onChange={setTab} options={TABS} label="Panel" />
      {pager ? (
        <Pager
          label={pager.label}
          unit={pager.unit}
          onPrev={() => pager.set((o) => o + 1)}
          onNext={() => pager.set((o) => Math.max(0, o - 1))}
          nextDisabled={pager.offset === 0}
        />
      ) : (
        // Following has no pager; its space is kept so the tabs don't jump when switching.
        <Pager placeholder label="This week" unit="week" />
      )}
    </div>
  )

  return (
    <Panel
      icon={HistoryIcon}
      title={TABS.find((t) => t.value === tab)!.title}
      actions={actions}
      className="[&_h2]:whitespace-nowrap"
      bodyClassName="px-5 pt-3.5 pb-[18px]"
    >
      {tab === 'recap' ? (
        <WeeklyRecap query={recap} />
      ) : tab === 'daily' ? (
        <DailyChambers query={daily} today={dayOffset === 0} />
      ) : (
        <Following />
      )}
    </Panel>
  )
}

interface PanelQuery<T> {
  data: T | undefined
  isPending: boolean
  isError: boolean
  error: unknown
  isPlaceholderData: boolean
  refetch: () => unknown
}

const listClass = 'm-0 list-none p-0'
const rowClass = (cols: string) => cn('grid h-7 items-center gap-2.5 text-sm odd:bg-row', cols)

// Recap rows: map, players, rank, time, improvement (phones drop the improvement and stack co-op names).
const RECAP_COLS =
  'grid-cols-[minmax(0,1fr)_minmax(0,2fr)_34px_64px_60px] upto600:h-auto upto600:min-h-[34px] upto600:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_30px_58px] upto600:py-[3px] upto600:[&>:nth-child(5)]:hidden'
// Daily rows are recap rows too in legacy (same phone layout), with their own columns.
const DAILY_COLS =
  'grid-cols-[24px_minmax(0,2fr)_34px_64px_92px] upto600:h-auto upto600:min-h-[34px] upto600:grid-cols-[20px_minmax(0,1fr)_30px_58px] upto600:py-[3px] upto600:[&>:nth-child(5)]:hidden'
const FOLLOWING_COLS =
  'grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_34px_92px_78px] upto900:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_30px_auto] upto900:[&>:nth-child(5)]:hidden'

const rankCell = 'flex items-center justify-center self-stretch bg-rank-new'

function Players({ players }: { players: Player[] }) {
  return (
    <span className="flex min-w-0 items-center gap-x-2 overflow-hidden whitespace-nowrap upto600:flex-col upto600:items-start upto600:gap-0.5">
      {players.map((p, j) => (
        <span
          key={p.profileNumber ?? j}
          className="inline-flex min-w-0 max-w-full items-center gap-1.5 overflow-hidden"
        >
          {j > 0 && <span className="mr-0.5 text-text-muted upto600:hidden">&amp;</span>}
          <Avatar src={p.avatar} name={p.name} size={22} className="upto600:size-[18px]!" />
          <PlayerLink player={p} className="min-w-0 truncate" />
        </span>
      ))}
    </span>
  )
}

function MapLink({ run }: { run: Run }) {
  return (
    <AppLink href={mapPath(run.map)} className="truncate pl-2 whitespace-nowrap">
      {run.map.title}
    </AppLink>
  )
}

function Stale({ stale, children }: { stale: boolean; children: ReactNode }) {
  return <div className={cn(stale && 'opacity-45 transition-opacity duration-150')}>{children}</div>
}

function WeeklyRecap({ query }: { query: PanelQuery<RecapData> }) {
  if (query.isPending) return <Loading />
  if (query.isError && !query.data)
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  const runs = query.data?.runs ?? []
  if (!runs.length) return <EmptyState>No runs this week yet.</EmptyState>
  return (
    <Stale stale={query.isPlaceholderData}>
      <ol className={listClass}>
        {runs.map((e) => (
          <li key={`${e.game}-${e.id}`} className={rowClass(RECAP_COLS)}>
            <MapLink run={e} />
            <Players players={e.players} />
            <span className={cn('num', rankCell)}>
              <RankNumber rank={e.postRank} />
            </span>
            <span className="num text-right upto600:pr-1.5">
              <TimeButton score={e.score} players={e.players} map={e.map} />
            </span>
            <span
              className="num pr-2 text-right text-[13px] text-green"
              title={`${timeAgo(e.timestamp)} · ${formatDateTime(e.timestamp)}`}
            >
              {e.scoreDelta != null ? formatDelta(e.scoreDelta) : 'new'}
            </span>
          </li>
        ))}
      </ol>
    </Stale>
  )
}

/** Runs shown per daily chamber (the map page has the rest). */
const DAILY_SHOWN = 3

function DailyChambers({ query, today }: { query: PanelQuery<DailyData>; today: boolean }) {
  const catalog = useCatalog()
  if (query.isPending) return <Loading />
  if (query.isError && !query.data)
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  const chambers = query.data?.chambers ?? []
  if (!chambers.length) return <EmptyState>No daily chambers.</EmptyState>
  return (
    <Stale stale={query.isPlaceholderData}>
      <div className="flex flex-col gap-2.5">
        {chambers.map((c) => (
          <section key={c.mode}>
            <header className="flex items-baseline gap-2.5 border-b border-line px-2 pb-1">
              <span className="text-[13px] tracking-[0.05em] text-text-muted uppercase">
                {catalog.modeLabels[c.mode] ?? c.mode}
              </span>
              {c.map ? (
                <AppLink href={mapPath(c.map)} className="text-base font-semibold">
                  {c.map.title}
                </AppLink>
              ) : (
                <span className="text-base font-semibold">Unknown map</span>
              )}
              {c.runs.length > DAILY_SHOWN && (
                <span className="ml-auto text-[13px] text-text-muted">
                  +{c.runs.length - DAILY_SHOWN} more
                </span>
              )}
            </header>
            {c.runs.length ? (
              <ol className={listClass}>
                {c.runs.slice(0, DAILY_SHOWN).map((e, i) => (
                  <li key={`${e.game}-${e.id}`} className={rowClass(DAILY_COLS)}>
                    <span className="num text-center text-text-muted">{i + 1}</span>
                    <Players players={e.players} />
                    <span className={cn('num', rankCell)}>
                      <RankNumber rank={e.postRank} />
                    </span>
                    <span className="num text-right upto600:pr-1.5">
                      <TimeButton score={e.score} players={e.players} map={e.map} />
                    </span>
                    <span
                      className="pr-2 text-right text-[13px] text-green"
                      title={formatDateTime(e.timestamp)}
                    >
                      {timeAgo(e.timestamp)}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mx-2 mt-1.5 mb-0 text-sm text-text-muted">
                {today ? 'No times yet today. Be the first!' : 'No times that day.'}
              </p>
            )}
          </section>
        ))}
      </div>
    </Stale>
  )
}

function Following() {
  const catalog = useCatalog()
  const { follows } = useFollows()
  const ids = follows.map((p) => p.profileNumber)
  const feed = useQuery({ ...followingFeedQueryOptions(ids, catalog), enabled: ids.length > 0 })
  if (!follows.length)
    return <EmptyState>Follow players from their profile to see their latest runs here.</EmptyState>
  if (feed.isPending) return <Loading />
  const entries = feed.data ?? []
  if (!entries.length) return <EmptyState>The players you follow have no runs yet.</EmptyState>
  return (
    <ul className={listClass}>
      {entries.map((e) => {
        const followed =
          e.players.find((p) => follows.some((f) => f.profileNumber === p.profileNumber)) ?? e.players[0]!
        return (
          <li key={`${e.game}-${e.id}`} className={rowClass(FOLLOWING_COLS)}>
            <MapLink run={e} />
            <span className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap">
              <Avatar src={followed.avatar} name={followed.name} size={22} />
              <PlayerLink player={followed} />
            </span>
            <span className={cn('num', rankCell)}>
              <RankNumber rank={e.postRank} />
            </span>
            <span className="text-[13px] whitespace-nowrap text-green" title={formatDateTime(e.timestamp)}>
              {timeAgo(e.timestamp)}
            </span>
            <span
              className="num pr-2 text-[13px] whitespace-nowrap text-text-muted"
              title={formatDateTime(e.timestamp)}
            >
              {formatDate(e.timestamp)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
