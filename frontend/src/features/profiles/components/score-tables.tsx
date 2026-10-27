import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import type { ReactNode } from 'react'
import { AppLink } from '@/components/app-link'
import { Avatar } from '@/components/avatar'
import { ChevronDownIcon, SortDownIcon, SortUpIcon } from '@/components/icons'
import { PlayerLink } from '@/components/player-link'
import { RankNumber } from '@/components/rank'
import { AutorenderLink, CommentButton, DemoLink, YouTubeLink } from '@/components/runs/run-media'
import { TimeButton } from '@/components/runs/time-button'
import { mapPath, type Chapter, type MapInfo } from '@/lib/catalog'
import { formatDateTime, formatDelta, timeAgo } from '@/lib/format'
import { RANK_TAG, rankTileVars } from '@/lib/ranks'
import { toggleOnRowClick } from '@/lib/rows'
import { scrollToCentre } from '@/lib/scroll'
import type { Player } from '@/types/runs'
import type { MapScore, ProfilePlayer, RenderRunDetails } from '../types'
import { columnDirection, columnSort, MAP_SORTS, type SortColumn } from '../utils/map-sort'
import { rankClass } from '../utils/tables'

export function SectionTitle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <h2
      className={cn(
        'mt-6 mb-3.5 border-b-2 border-text-muted pb-1 text-[30px] font-light uppercase',
        className,
      )}
    >
      {children}
    </h2>
  )
}

/** The run row for a map in the chapter tables (Summary scrolls to it). */
const runRowId = (map: MapInfo) => `pf-run-${map.id}`

const chapterKey = (c: Chapter) => c.dbId ?? `${c.mode}-${c.name}`
const chapterKind = (c: Chapter) => (c.multiplayer ? 'Course' : 'Chapter')

/**
 * Each chapter's average rank and a tile per map. A tile with a run opens it in the chapter tables
 * below (scrolled to); one without goes to the map page. `chapterLink(chapter)`: where a chapter's
 * average and name lead (its aggregated board), if it has one.
 */
export function Summary({
  chapters,
  scores,
  onSelectMap,
  chapterLink,
}: {
  chapters: Chapter[]
  scores: Record<string, MapScore>
  onSelectMap: (map: MapInfo) => void
  chapterLink?: (chapter: Chapter) => string
}) {
  const openRun = (m: MapInfo) => {
    onSelectMap(m)
    // After the row has opened.
    setTimeout(() => scrollToCentre(document.getElementById(runRowId(m))), 0)
  }
  return (
    <div className="flex flex-col gap-2.5 upto800:gap-[22px]">
      {chapters.map((chapter) => {
        const ranks = chapter.maps.map((m) => scores[m.id]?.rank).filter((r): r is number => Boolean(r))
        const avg = ranks.length ? Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length) : null
        const avgClass = cn(RANK_TAG, 'bg-track', avg && 'rank-tile')
        const nameClass = 'flex flex-col truncate text-lg leading-[1.1] whitespace-nowrap'
        const name = (
          <>
            <small className="text-[12px] text-text-muted uppercase">
              {chapterKind(chapter)} {chapter.number}
            </small>
            {chapter.name}
          </>
        )
        const link = chapterLink?.(chapter)
        return (
          <div
            key={chapterKey(chapter)}
            className="grid min-h-[34px] grid-cols-[78px_190px_minmax(0,1fr)] items-center gap-3 upto800:grid-cols-[48px_minmax(0,1fr)] upto800:gap-y-2.5"
          >
            {link ? (
              <>
                <AppLink
                  href={link}
                  className={cn(avgClass, 'hover:outline hover:outline-foreground')}
                  style={rankTileVars(avg)}
                  title={`Average rank · ${chapter.name} board`}
                >
                  {avg ?? '–'}
                </AppLink>
                <AppLink
                  href={link}
                  className={cn(nameClass, 'hover:underline')}
                  title={`${chapter.name} board`}
                >
                  {name}
                </AppLink>
              </>
            ) : (
              <>
                <span className={avgClass} style={rankTileVars(avg)} title="Average rank">
                  {avg ?? '–'}
                </span>
                <span className={nameClass}>{name}</span>
              </>
            )}
            <span className="flex flex-wrap gap-2.5 upto800:col-span-full upto800:gap-1.5">
              {chapter.maps.map((m) => {
                const rank = scores[m.id]?.rank
                const title = `${m.title}${rank ? ` — rank ${rank}` : ''}`
                const tile = cn(
                  RANK_TAG,
                  'cursor-pointer border-0 bg-track p-0 hover:outline hover:outline-foreground',
                )
                return scores[m.id] ? (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => openRun(m)}
                    // Its own hover only: the tiles share a parent, so a row hover would shine them all.
                    className={cn(tile, rankClass(rank, true), 'wr-glow-self')}
                    style={rankTileVars(rank)}
                    title={title}
                  >
                    <RankNumber rank={rank} inherit />
                  </button>
                ) : (
                  <Link
                    key={m.id}
                    to="/map/$mode/$levelId"
                    params={{ mode: m.mode, levelId: m.id }}
                    className={tile}
                    title={title}
                  >
                    <RankNumber rank={rank} inherit />
                  </Link>
                )
              })}
            </span>
          </div>
        )
      })}
    </div>
  )
}

const COLS = 'grid-cols-[82px_minmax(0,1.6fr)_110px_100px_100px_100px_228px]'
const COOP_COLS = 'grid-cols-[82px_minmax(0,1.4fr)_100px_90px_90px_90px_minmax(0,1fr)_228px]'
const PHONE_COLS = 'upto800:grid-cols-[44px_minmax(0,1fr)_68px_54px_30px]'
const row = (coop: boolean) =>
  cn('grid min-h-[37px] items-center text-lg *:px-2.5', coop ? COOP_COLS : COLS, PHONE_COLS)
const desktopOnly = 'upto800:hidden'
const iconGap = <span className="w-6" />

/** A column's header; with `onSort`, a button that sorts the maps by it (again: the other way). */
function ColumnHeader({
  column,
  label,
  sort = 'default',
  onSort,
  className,
}: {
  column: SortColumn
  label: string
  sort?: string
  onSort?: (sort: string) => void
  className?: string
}) {
  if (!onSort) return <span className={cn('text-right', className)}>{label}</span>
  const direction = columnDirection(column, sort)
  const next = columnSort(column, sort)
  const Arrow = direction === 'desc' ? SortDownIcon : SortUpIcon
  return (
    <span className={cn('text-right', className)}>
      <button
        type="button"
        className={cn(
          'inline-flex cursor-pointer items-center gap-0.5 border-0 bg-transparent p-0 text-inherit uppercase hover:text-foreground',
          direction && 'font-normal text-foreground',
        )}
        onClick={() => onSort(next)}
        aria-label={`Sort by ${label}`}
        title={MAP_SORTS.find((o) => o.value === next)?.label}
      >
        {direction && <Arrow className="size-3.5" />}
        {label}
      </button>
    </span>
  )
}

/** One chapter's maps: rank, time, deltas, points, partner (co-op) and links; a row opens its run. */
export function ChapterTable({
  chapter,
  scores,
  coop,
  game,
  rendered,
  selectedMap,
  onSelectMap,
  player,
  chapterLink,
  sort,
  onSort,
  renderRunDetails,
}: {
  chapter: Chapter & { sorted?: boolean }
  scores: Record<string, MapScore>
  coop: boolean
  game: string
  rendered?: Map<number, string>
  selectedMap: MapInfo | null
  onSelectMap: (map: MapInfo | null) => void
  player: ProfilePlayer
  chapterLink?: string
  /** The maps' order; with `onSort`, the column headers change it. */
  sort?: string
  onSort?: (sort: string) => void
  renderRunDetails?: RenderRunDetails
}) {
  const header = { sort, onSort }
  return (
    <section className="mt-7">
      <div
        className={cn(
          row(coop),
          'mb-1 min-h-10 border-b-2 border-text-muted text-base font-light text-text-2 uppercase upto800:text-sm',
        )}
      >
        <h3 className="col-span-2 m-0 pr-0! pl-[82px]! text-[30px] font-light text-foreground upto800:pl-0! upto800:text-[22px]">
          {chapterLink ? (
            <AppLink href={chapterLink} className="hover:underline" title={`${chapter.name} board`}>
              {chapter.name}
            </AppLink>
          ) : (
            chapter.name
          )}
        </h3>
        <ColumnHeader column="time" label="Time" {...header} />
        <ColumnHeader column="next" label="ΔNext" {...header} />
        <ColumnHeader column="wr" label="ΔWR" className={desktopOnly} {...header} />
        <ColumnHeader column="points" label="Points" className={desktopOnly} {...header} />
        {coop && <span className={cn(desktopOnly, 'min-h-8 text-sm text-text-muted')}>Partner</span>}
        <span />
      </div>
      {chapter.maps.map((m, i) => (
        <ChapterRow
          key={m.id}
          map={m}
          score={scores[m.id]}
          striped={i % 2 === 1}
          coop={coop}
          game={game}
          rendered={rendered}
          selected={selectedMap?.id === m.id}
          onSelectMap={onSelectMap}
          player={player}
          sorted={Boolean(chapter.sorted)}
          renderRunDetails={renderRunDetails}
        />
      ))}
    </section>
  )
}

const Dash = () => <span className="text-text-muted">–</span>

function ChapterRow({
  map: m,
  score: s,
  striped,
  coop,
  game,
  rendered,
  selected,
  onSelectMap,
  player,
  sorted,
  renderRunDetails,
}: {
  map: MapInfo
  score: MapScore | undefined
  striped: boolean
  coop: boolean
  game: string
  rendered?: Map<number, string>
  selected: boolean
  onSelectMap: (map: MapInfo | null) => void
  player: ProfilePlayer
  sorted: boolean
  renderRunDetails?: RenderRunDetails
}) {
  // The selected map's run is the open one (from its row or the Summary). Opening a run also
  // narrows History to its map; closing it shows all history again.
  const open = Boolean(s) && selected
  const toggle = () => onSelectMap(open ? null : m)
  const players: Player[] = s?.partner ? [player, s.partner] : [player]
  return (
    <div id={runRowId(m)}>
      <div
        className={cn(
          row(coop),
          open ? 'bg-seg-active' : striped ? 'bg-panel-head' : 'bg-row',
          selected && 'outline outline-1 -outline-offset-1 outline-brand',
          s && 'cursor-pointer hover:brightness-[1.15]',
          'shadow-[inset_-4px_0_0_var(--rank-color-dark,transparent)] light:shadow-[inset_-4px_0_0_var(--rank-color,transparent)]',
        )}
        style={s ? rankTileVars(s.rank) : undefined}
        aria-expanded={s ? open : undefined}
        onClick={s ? toggleOnRowClick(toggle) : undefined}
      >
        {/* A tag like the Summary's tiles; on phones it fills the narrow column. */}
        <span className="flex items-center upto800:px-0!">
          <span className={cn(RANK_TAG, 'bg-track', rankClass(s?.rank, true))}>
            <RankNumber rank={s?.rank} inherit />
          </span>
        </span>
        {/* Only the name links to the map; the rest of the row opens the run. */}
        {/* Legacy's own 2px 14px padding lost to the row's `> span` rule: the row's 0 10px applies. */}
        <span className="flex min-w-0 flex-col truncate leading-[1.1] whitespace-nowrap">
          <AppLink href={mapPath(m)} className="max-w-full self-start truncate hover:underline">
            {m.title}
          </AppLink>
          <small
            className="truncate text-[13px] font-light text-text-muted"
            title={s?.timestamp ? formatDateTime(s.timestamp) : undefined}
          >
            {sorted ? `${m.chapter} · ` : ''}
            {s?.timestamp ? timeAgo(s.timestamp) : s ? '' : 'No score'}
          </small>
        </span>
        {/* No score: dashes, the time one still opening the history (to find banned runs). */}
        <span className={cn('num text-right', !s && 'text-text-muted')}>
          <TimeButton score={s?.score ?? null} players={players} map={m} />
        </span>
        <span className="num text-right upto800:text-[15px] upto800:text-text-2">
          {s?.deltaNext != null ? formatDelta(s.deltaNext) : s ? '' : <Dash />}
        </span>
        <span className={cn('num text-right', desktopOnly)}>
          {s?.deltaWr != null ? formatDelta(s.deltaWr) : s ? '' : <Dash />}
        </span>
        <span className={cn('num text-right', desktopOnly)}>
          {s?.points != null ? s.points.toFixed(1) : s ? '' : <Dash />}
        </span>
        {coop && (
          <span
            className={cn('flex min-w-0 items-center gap-3 overflow-hidden whitespace-nowrap', desktopOnly)}
          >
            {s?.partner && (
              <>
                <Avatar src={s.partner.avatar} name={s.partner.name} size={30} />
                <PlayerLink player={s.partner} />
              </>
            )}
          </span>
        )}
        <span className="flex items-center justify-end gap-3.5 pr-[18px]! upto800:pr-1.5! [&_svg]:block">
          <span className={cn('contents', 'upto800:*:hidden')}>
            {s ? <CommentButton note={s.note} size={24} /> : iconGap}
            {s ? <AutorenderLink run={s} game={game} rendered={rendered} size={24} /> : iconGap}
            <YouTubeLink id={s?.youtubeId} size={24} />
            <DemoLink demoId={s?.demoId} size={24} />
          </span>
          {s ? (
            <button
              type="button"
              className="inline-flex cursor-pointer border-0 bg-transparent p-0 text-inherit"
              onClick={toggle}
              aria-expanded={open}
              aria-label={`${open ? 'Hide' : 'Show'} run details for ${m.title}`}
            >
              <ChevronDownIcon
                className={cn('size-6 transition-transform duration-150', open && 'rotate-180')}
              />
            </button>
          ) : (
            iconGap
          )}
        </span>
      </div>
      {open && s && renderRunDetails?.(s, m, game, rendered ?? new Map())}
    </div>
  )
}
