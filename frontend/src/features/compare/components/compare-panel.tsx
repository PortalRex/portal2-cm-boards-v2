import { useQuery } from '@tanstack/react-query'
import { cn } from 'cn'
import { useState } from 'react'
import { AppLink } from '@/components/app-link'
import { Avatar } from '@/components/avatar'
import { PeopleIcon, SwapIcon } from '@/components/icons'
import { Panel } from '@/components/panel'
import { PlayerLink } from '@/components/player-link'
import { RankNumber } from '@/components/rank'
import { SeasonSelect } from '@/components/season-select'
import { Segmented } from '@/components/segmented'
import { EmptyState, Loading } from '@/components/status'
import { useDebounced } from '@/hooks/use-debounced'
import { useGame } from '@/hooks/use-game'
import { useSeason } from '@/hooks/use-season'
import { chaptersFor, mapLink, modeLabel, seasonBoard, useCatalog } from '@/lib/catalog'
import { formatDelta, formatLongScore, formatScore } from '@/lib/format'
import {
  compareSideQueryOptions,
  userSearchQueryOptions,
  type CompareSide,
  type SideScore,
} from '../api/compare'
import { compareSummary } from '../utils/summary'

export interface CompareSearch {
  a?: string
  b?: string
  mode?: string
  season?: string
  game?: string
}

/** Two players' best times side by side, map by map, for one game and board. */
export function ComparePanel({
  search,
  onChange,
}: {
  search: CompareSearch
  /** Sets (or with '' removes) address parameters, keeping the others. */
  onChange: (changes: Partial<Record<keyof CompareSearch, string>>) => void
}) {
  const catalog = useCatalog()
  const a = search.a ?? ''
  const b = search.b ?? ''
  // An old ?game=<season> link: its game with the season picked.
  const raw = search.game ? catalog.games[search.game] : undefined
  const oldSeason = raw?.kind === 'season' && raw.base && catalog.games[raw.base] ? raw.id : null
  // The game picked under the logo (an old ?game= link picks it).
  const game = useGame()
  const picked = useSeason(game)
  const season = oldSeason ?? picked
  const modes = catalog.games[game]?.modes ?? []
  const mode = search.mode && modes.includes(search.mode) ? search.mode : (modes[0] ?? '')
  // With a season picked: the season's results and its copy of the board.
  const source = season ?? game
  const board = season ? seasonBoard(catalog, season, game, mode) : mode
  const left = useQuery({ ...compareSideQueryOptions(catalog, a, source), enabled: Boolean(a) })
  const right = useQuery({ ...compareSideQueryOptions(catalog, b, source), enabled: Boolean(b) })
  const leftLoading = Boolean(a) && left.isPending
  const rightLoading = Boolean(b) && right.isPending

  return (
    <Panel
      icon={PeopleIcon}
      title="Compare players"
      className="rounded-tl-none"
      bodyClassName="flex flex-col gap-5 px-[26px] pt-6 pb-[30px] max-[760px]:px-2.5 max-[760px]:pt-3.5 max-[760px]:pb-5"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 max-[760px]:gap-2">
        <PlayerSlot
          key={`a-${a}`}
          side={a ? left.data : undefined}
          loading={leftLoading}
          onPick={(pn) => onChange({ a: pn })}
          label="First player"
        />
        <button
          type="button"
          onClick={() => onChange({ a: b, b: a })}
          disabled={!a && !b}
          title="Swap players"
          aria-label="Swap players"
          className="inline-grid size-10 cursor-pointer place-items-center rounded-full border border-line-strong bg-control p-0 text-foreground disabled:cursor-default disabled:opacity-40 max-[760px]:size-[34px] [&_svg]:size-[22px]"
        >
          <SwapIcon />
        </button>
        <PlayerSlot
          key={`b-${b}`}
          side={b ? right.data : undefined}
          loading={rightLoading}
          onPick={(pn) => onChange({ b: pn })}
          label="Second player"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3.5">
        <SeasonSelect
          base={game}
          season={season}
          onChange={(s) => onChange({ game: '', season: s ?? '' })}
          className="min-w-[220px]"
        />
        <Segmented
          value={mode}
          onChange={(m) => onChange({ mode: m === modes[0] ? '' : m })}
          label="Mode"
          options={modes.map((m) => ({ value: m, label: modeLabel(catalog, m) }))}
        />
      </div>
      {a && b && left.data && right.data ? (
        board ? (
          <Comparison board={board} left={left.data} right={right.data} />
        ) : (
          <EmptyState>
            {catalog.games[season ?? '']?.label} has no {modeLabel(catalog, mode)} maps.
          </EmptyState>
        )
      ) : (
        !leftLoading && !rightLoading && <EmptyState>Pick two players to compare their times.</EmptyState>
      )}
    </Panel>
  )
}

const slot =
  'flex min-h-[72px] items-center gap-3.5 rounded-md bg-row px-3.5 py-2 max-[760px]:flex-col max-[760px]:gap-1.5 max-[760px]:px-1.5 max-[760px]:py-2.5 max-[760px]:text-center'

function PlayerSlot({
  side,
  loading,
  onPick,
  label,
}: {
  side: CompareSide | undefined
  loading: boolean
  onPick: (profileNumber: string) => void
  label: string
}) {
  const [changing, setChanging] = useState(false)
  if (loading && !side) {
    return (
      <div className={slot}>
        <Loading />
      </div>
    )
  }
  if (side && !changing) {
    return (
      <div className={slot}>
        <Avatar src={side.player.avatar} name={side.player.name} size={64} className="max-[760px]:size-12!" />
        <div className="flex flex-col gap-0.5 text-[22px] font-semibold max-[760px]:max-w-full max-[760px]:items-center max-[760px]:text-[17px] max-[760px]:[overflow-wrap:anywhere]">
          <PlayerLink player={side.player} />
          <button
            type="button"
            onClick={() => setChanging(true)}
            className="cursor-pointer self-start border-0 bg-transparent p-0 text-sm font-normal text-brand-light max-[760px]:self-center"
          >
            Change
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className={slot}>
      <PlayerSearch
        label={label}
        onPick={(pn) => {
          setChanging(false)
          onPick(pn)
        }}
      />
    </div>
  )
}

/** A name or Steam id box listing the matching players (searched once typing stops). */
function PlayerSearch({ label, onPick }: { label: string; onPick: (profileNumber: string) => void }) {
  const [q, setQ] = useState('')
  const query = useDebounced(q, 250)
  const searching = query.trim().length >= 2
  const results = useQuery({ ...userSearchQueryOptions(query), enabled: searching })
  return (
    <div className="relative flex-1">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`${label}: name or Steam ID`}
        aria-label={label}
        autoFocus
        className="h-10 w-full rounded-[4px] border border-line bg-control px-3 text-base text-foreground"
      />
      {searching && (
        <ul
          aria-label={`${label} results`}
          className="absolute inset-x-0 top-11 z-20 m-0 list-none rounded-md border border-line bg-menu p-1"
        >
          {(results.data ?? []).map((p) => (
            <li key={p.profileNumber}>
              <button
                type="button"
                onClick={() => p.profileNumber && onPick(p.profileNumber)}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-[4px] border-0 bg-transparent px-2 py-1.5 text-left text-[15px] text-foreground hover:bg-seg-hover"
              >
                <Avatar src={p.avatar} name={p.name} size={24} />
                <span>{p.name}</span>
                <small className="ml-auto text-text-muted">{p.runs} runs</small>
              </button>
            </li>
          ))}
          {results.data && !results.data.length && (
            <li className="px-2 py-1.5 text-text-muted">No players found.</li>
          )}
        </ul>
      )}
    </div>
  )
}

function Comparison({ board, left, right }: { board: string; left: CompareSide; right: CompareSide }) {
  const catalog = useCatalog()
  const chapters = chaptersFor(catalog, board)
  const summary = compareSummary(chapters, left.scores, right.scores)
  const score = (n: number, ahead: boolean) => (
    <div className="flex flex-col items-center text-text-muted">
      <strong
        className={cn('num text-[34px] max-[760px]:text-[26px]', ahead ? 'text-green' : 'text-foreground')}
      >
        {n}
      </strong>
      <span className="max-[760px]:text-center max-[760px]:text-xs">maps faster</span>
    </div>
  )
  return (
    <>
      <div
        aria-label="Summary"
        className="grid grid-cols-[160px_minmax(0,1fr)_160px] items-center gap-4 rounded-md bg-row px-[18px] py-3.5 max-[760px]:grid-cols-[70px_minmax(0,1fr)_70px] max-[760px]:gap-2 max-[760px]:px-2 max-[760px]:py-3"
      >
        {score(summary.left, summary.left > summary.right)}
        <div className="flex flex-col items-center gap-1 text-center text-[15px] max-[760px]:text-[13px]">
          <span className="num">{summary.ties} tied</span>
          {summary.shared > 0 && (
            <span className="num">
              {formatLongScore(summary.leftTotal)} vs {formatLongScore(summary.rightTotal)} over{' '}
              {summary.shared} shared maps
            </span>
          )}
          {(summary.onlyLeft > 0 || summary.onlyRight > 0) && (
            <span className="text-text-muted">
              Including maps only one has a time on: {left.player.name} {summary.onlyLeft} ·{' '}
              {right.player.name} {summary.onlyRight}
            </span>
          )}
        </div>
        {score(summary.right, summary.right > summary.left)}
      </div>
      {chapters.map((c) => (
        <section key={c.dbId ?? c.name}>
          <h3 className="m-0 mb-1.5 text-lg font-semibold">
            <small className="mr-1.5 font-normal text-text-muted">
              {c.multiplayer ? 'Course' : 'Chapter'} {c.number}
            </small>{' '}
            {c.name}
          </h3>
          {c.maps.map((m, i) => {
            const l = left.scores[m.id]
            const r = right.scores[m.id]
            const diff = l && r ? l.score - r.score : null
            return (
              <div
                key={m.id}
                role="row"
                aria-label={m.title}
                className={cn(
                  'grid min-h-[38px] grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] items-center text-base max-[760px]:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)] max-[760px]:text-sm',
                  i % 2 === 0 && 'bg-row',
                )}
              >
                <Side score={l} win={diff != null ? diff < 0 : Boolean(l)} />
                <span className="flex flex-col items-center text-center max-[760px]:text-[13px]">
                  <AppLink href={mapLink(catalog, m)}>{m.title}</AppLink>
                  {diff != null && diff !== 0 && (
                    <small className="num text-[13px] text-text-muted">{formatDelta(Math.abs(diff))}</small>
                  )}
                </span>
                <Side score={r} win={diff != null ? diff > 0 : Boolean(r)} right />
              </div>
            )
          })}
        </section>
      ))}
    </>
  )
}

function Side({
  score,
  win,
  right = false,
}: {
  score: SideScore | undefined
  win: boolean
  right?: boolean
}) {
  return (
    <span
      className={cn(
        'flex items-center gap-3 px-3 max-[760px]:gap-1.5 max-[760px]:px-1.5',
        right && 'flex-row-reverse',
      )}
      data-win={win || undefined}
    >
      {score ? (
        <>
          <span className="num min-w-[34px] text-center text-sm text-text-muted max-[760px]:min-w-[22px] max-[760px]:text-xs">
            <RankNumber rank={score.rank} />
          </span>
          <span className={cn('num', win && 'font-semibold text-green')}>{formatScore(score.score)}</span>
        </>
      ) : (
        <span className="text-text-muted">–</span>
      )}
    </span>
  )
}
