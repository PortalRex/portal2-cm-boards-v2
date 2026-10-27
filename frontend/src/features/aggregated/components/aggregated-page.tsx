import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { cn } from 'cn'
import type { ReactNode } from 'react'
import { AppLink } from '@/components/app-link'
import { boardsBackground } from '@/components/layouts/backgrounds'
import { Page } from '@/components/layouts/page'
import { Redirect } from '@/components/redirect'
import { SeasonSelect } from '@/components/season-select'
import { Select } from '@/components/select'
import { EmptyState, ErrorState, Loading } from '@/components/status'
import {
  chapterDbId,
  chaptersFor,
  gameBoardPath,
  PORTAL2,
  useCatalog,
  withSeason,
  type Catalog,
} from '@/lib/catalog'
import { countryName } from '@/lib/data/countries'
import { formatLongScore, formatPoints } from '@/lib/format'
import { aggregatedQueryOptions } from '../api/aggregated'
import type { AggregatedRow } from '../types'
import { boardTabs, type AggregatedTarget, type AggregatedView } from '../utils/pages'
import { PointsBoard } from './points-board'

export interface AggregatedSearch {
  season?: string
  /** Only this country's players (ranks within the country). */
  country?: string
  /** Open on the page with this player, their row marked (from a profile's ranks). */
  player?: string
}

// What each board ranks by: equal values share a place; without points, no place.
const byPoints = (r: AggregatedRow) => (r.points > 0 ? r.points : null)
const byTime = (r: AggregatedRow) => r.score

// Legacy's arrow sat 14px inside the 2px border, so 16px from the edge.
const selectClass =
  'min-w-[222px] [&_select]:rounded-md! [&_select]:border-2! [&_select]:bg-panel-head! [&_[data-slot=native-select-icon]]:right-4!'

/** An aggregated board's page, or where its address sends you. */
export function AggregatedPage({
  resolve,
  search,
}: {
  resolve: (c: Catalog) => AggregatedTarget
  search: AggregatedSearch
}) {
  const target = resolve(useCatalog())
  if ('redirect' in target) return <Redirect href={target.redirect} />
  if ('noSeason' in target) return <NoSeason />
  return <AggregatedBoards view={target.view} search={search} />
}

function Header({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <header className="mt-1 mb-[34px] flex flex-col items-center text-center">
      <p className="m-0 text-[40px] leading-none font-light uppercase upto860:text-[26px]">{kicker}</p>
      <h1 className="mt-0 mb-[22px] text-[64px] leading-[1.1] font-bold uppercase upto860:text-[44px] upto600:text-[38px]">
        {title}
      </h1>
      {children}
    </header>
  )
}

function NoSeason() {
  return (
    <Page background={boardsBackground} tint="warm" narrow>
      <Header kicker="Seasons" title="No season yet" />
      <section className="mx-auto max-w-[1440px]">
        <EmptyState>There’s no season running. Check back soon.</EmptyState>
      </section>
    </Page>
  )
}

// Portal 2's Single Player / Cooperative boards: all of the mode's chapters, or one chapter / course.
const chapterOptions = (c: Catalog, mode: string) => [
  { value: `/leaderboard/${mode}`, label: mode === 'coop' ? 'All courses' : 'All chapters' },
  ...chaptersFor(c, mode).map((ch) => ({
    value: `/leaderboard/chapter/${chapterDbId(ch)}`,
    label: `${ch.multiplayer ? 'Course' : 'Chapter'} ${ch.number}: ${ch.name}`,
  })),
]

function AggregatedBoards({ view, search }: { view: AggregatedView; search: AggregatedSearch }) {
  const catalog = useCatalog()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { game, kind, season, board } = view
  const data = useQuery({
    ...aggregatedQueryOptions(catalog, board ?? { game, board: kind }),
    enabled: Boolean(board),
  })
  const country = search.country ?? ''
  const focus = search.player || null
  const go = (href: string, replace = false) => void navigate({ href, replace })
  // Switching board (tab, chapter or season) keeps the chosen country and season.
  const keep = (to: string, s: string | null = season) =>
    withSeason(country ? `${to}?country=${encodeURIComponent(country)}` : to, s)
  // Like legacy, picking a country starts the address afresh (it drops ?season= and ?player=).
  const setCountry = (c: string) => go(c ? `${pathname}?country=${encodeURIComponent(c)}` : pathname, true)

  const rows = board ? data.data : undefined
  const countries = [
    ...new Set((rows?.points ?? []).map((r) => r.player.country).filter((c) => c != null)),
  ].sort((a, b) => (countryName(a) ?? a).localeCompare(countryName(b) ?? b))
  const inCountry = (list: AggregatedRow[] = []) =>
    country ? list.filter((r) => r.player.country === country) : list
  const boardKey = `${board?.game ?? ''}:${board?.board ?? ''}:${country}`

  return (
    <Page background={boardsBackground} tint="warm">
      <Header kicker={view.kicker} title={view.title}>
        <div className="flex flex-wrap justify-center gap-3">
          <SeasonSelect
            base={game}
            season={season}
            onChange={(s) =>
              go(keep(s && pathname.includes('/chapter/') ? gameBoardPath(game, kind) : pathname, s))
            }
            className={selectClass}
          />
          {!season && game === PORTAL2 && (kind === 'sp' || kind === 'coop') && (
            <Select
              value={pathname}
              onChange={(to) => go(keep(to))}
              options={chapterOptions(catalog, kind)}
              label="Chapter"
              className={selectClass}
            />
          )}
          {countries.length > 0 && (
            <Select
              value={country}
              onChange={setCountry}
              options={[
                { value: '', label: 'All countries' },
                ...countries.map((c) => ({ value: c, label: countryName(c) ?? c })),
              ]}
              label="Country"
              className={selectClass}
            />
          )}
        </div>
        <BoardTabs catalog={catalog} game={game} kind={kind} link={keep} />
      </Header>

      {/* Points and times as two separate panels side by side. */}
      <section className="mx-auto max-w-[1440px]">
        {board && data.isPending ? (
          <Loading />
        ) : board && data.isError ? (
          <ErrorState error={data.error} onRetry={() => void data.refetch()} />
        ) : (
          <div className="grid grid-cols-2 gap-[18px] upto860:grid-cols-1 upto860:gap-3.5">
            <PointsBoard
              key={`points-${boardKey}`}
              focus={focus}
              title="Points"
              rows={inCountry(rows?.points)}
              valueLabel="Aggregated points"
              value={(r) => formatPoints(r.points)}
              rankBy={byPoints}
            />
            <PointsBoard
              key={`time-${boardKey}`}
              focus={focus}
              title="Time"
              rows={inCountry(rows?.times)}
              valueLabel="Aggregated time"
              value={(r) => formatLongScore(r.score)}
              rankBy={byTime}
              empty={
                rows?.mapCount ? `No one has a time on all ${rows.mapCount} maps yet.` : 'No players yet.'
              }
            />
          </div>
        )}
      </section>
    </Page>
  )
}

function BoardTabs({
  catalog,
  game,
  kind,
  link,
}: {
  catalog: Catalog
  game: string
  kind: string
  link: (to: string) => string
}) {
  const tabs = boardTabs(catalog, game)
  if (!tabs) return null
  return (
    <nav aria-label={tabs.label} className="mt-4 flex gap-1.5 upto600:flex-wrap upto600:justify-center">
      {tabs.items.map((t) => (
        <AppLink
          key={t.kind}
          href={link(t.path)}
          aria-current={t.kind === kind ? 'page' : undefined}
          className={cn(
            'rounded-[4px] px-5 py-2 text-lg text-text-2',
            t.kind === kind ? 'bg-seg-active font-medium text-foreground' : 'hover:bg-seg-hover',
          )}
        >
          {t.label}
        </AppLink>
      ))}
    </nav>
  )
}
