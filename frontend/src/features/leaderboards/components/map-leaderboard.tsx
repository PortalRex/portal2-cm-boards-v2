import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { cn } from 'cn'
import { useState, type ReactNode } from 'react'
import { Avatar } from '@/components/avatar'
import { TrophyFilledIcon } from '@/components/icons'
import { ListEnd } from '@/components/list-end'
import { PlayerLink } from '@/components/player-link'
import { RankNumber, RankTag } from '@/components/rank'
import { AutorenderLink, CommentButton, DemoLink, YouTubeLink } from '@/components/runs/run-media'
import { TimeButton } from '@/components/runs/time-button'
import { SearchBox } from '@/components/search-box'
import { EmptyState, ErrorState, Loading } from '@/components/status'
import { useCoopPbStyle } from '@/hooks/use-coop-pb-style'
import { useCoopRoleOverrides } from '@/hooks/use-coop-role-overrides'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useEndlessRows } from '@/hooks/use-endless-rows'
import { useRenderedSet } from '@/hooks/use-rendered-set'
import { isMultiplayerMode, useCatalog, type MapInfo } from '@/lib/catalog'
import { coopRoles, NOT_PB_NAME, PB_NAME, pbColor, pbNameVars, tintFor } from '@/lib/coop-roles'
import { formatDateTime, formatScore, timeAgo } from '@/lib/format'
import { ageColor } from '@/lib/age-color'
import { RANK_TAG_BASE } from '@/lib/ranks'
import { toggleOnRowClick } from '@/lib/rows'
import { profileScoresQueryOptions } from '@/lib/runs/profile-scores'
import type { RankedRun } from '@/types/runs'
import { headBase, PAGE_SIZE, rowBase, TINT_BG } from '../utils/board-styles'
import { nonPbPlayers } from '../utils/coop-pbs'
import { RankPoints } from './rank-points'

// The rank tag's look, small enough for the board's narrow rank column.
const BOARD_TAG = cn(RANK_TAG_BASE, 'h-6 w-9 text-sm upto900:w-7')

/** `pov`: on a co-op run, the player whose side of the row was clicked (their profile number). */
export type RenderRunDetails = (
  run: RankedRun,
  map: MapInfo,
  rendered: Map<number, string>,
  pov: string | null,
) => ReactNode

export function MapLeaderboard({
  map,
  board,
  at,
  onClearAt,
  renderRunDetails,
}: {
  map: MapInfo
  board: UseQueryResult<RankedRun[]>
  at: string | null
  onClearAt: () => void
  renderRunDetails?: RenderRunDetails
}) {
  const catalog = useCatalog()
  const me = useCurrentUser()
  const mine = (e: RankedRun) =>
    Boolean(me && !me.sample && e.players.some((p) => p.profileNumber === me.profileNumber))
  const [search, setSearch] = useState('')
  const coop = isMultiplayerMode(catalog, map.mode)
  const q = search.trim().toLowerCase()
  const all = board.data ?? []
  const rows = all.filter((e) => !q || e.players.some((p) => p.name.toLowerCase().includes(q)))
  // Rows show PAGE_SIZE at a time, more as the board scrolls; a search starts from the top.
  const { visible, hasMore, end, showAtLeast } = useEndlessRows({ rows, resetKey: q, step: PAGE_SIZE })
  // Co-op: each half's own video (they're rendered from each player's demo).
  const rendered = useRenderedSet(
    visible.flatMap((e) => e.halves ?? [e]),
    map.game,
  )
  const [opened, setOpened] = useState<{ key: string | number; pov: string | null } | null>(null)
  const overrides = useCoopRoleOverrides()
  // Co-op: each player whose PB the run is gets marked as on Score Updates (trophy, or glowing
  // name with the others faded). A player repeats on slower runs when they carried partners to PBs.
  const notPb = coop ? nonPbPlayers(all) : new Map<RankedRun, Set<string>>()
  const [pbStyle] = useCoopPbStyle()
  const rowKey = (e: RankedRun) =>
    e.changelogId ?? `${e.rank}-${e.players.map((p) => p.profileNumber).join('-')}`

  // Jump to a board entry: clear the search, show the board down to it and open its details.
  const showEntry = (entry: RankedRun) => {
    const index = all.indexOf(entry)
    if (index < 0) return
    setSearch('')
    showAtLeast(index + 1, '')
    setOpened({ key: rowKey(entry), pov: null })
    setTimeout(
      () =>
        document
          .querySelector('[data-board-entry][data-open]')
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
      50,
    )
  }

  const cols = coop
    ? // Co-op: no links column, each player's are by their name.
      '[--mp-cols:40px_minmax(0,1fr)_minmax(0,1fr)_minmax(90px,0.6fr)_80px] upto900:[--mp-cols:28px_minmax(0,1fr)_minmax(0,1fr)_58px] upto480:[--mp-cols:28px_minmax(0,1fr)_minmax(0,1fr)_50px]'
    : '[--mp-cols:40px_minmax(0,1.4fr)_minmax(110px,0.8fr)_90px_150px] upto900:[--mp-cols:32px_minmax(0,1fr)_76px]'

  return (
    <>
      {at ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border border-brand bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] px-3.5 py-2.5">
          <span>
            Leaderboard as it stood on <strong className="num">{formatDateTime(at)}</strong>
          </span>
          <button
            type="button"
            onClick={onClearAt}
            className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-brand hover:underline"
          >
            Back to the current board
          </button>
        </div>
      ) : (
        <YourBest map={map} board={board.data} onShow={showEntry} />
      )}
      <div className="mb-[18px] flex items-center justify-between gap-4 upto900:flex-col upto900:items-stretch">
        <SearchBox value={search} onChange={setSearch} placeholder="Search players" />
      </div>
      <div className={cols} role="table" aria-label="Leaderboard">
        <div role="row" className={cn(rowBase, headBase)}>
          <span role="columnheader" className="text-center text-[15px]">
            #
          </span>
          <span role="columnheader">{coop ? 'Blue' : 'Player'}</span>
          {coop && <span role="columnheader">Orange</span>}
          {/* Phones: only rank, player(s) and time (legacy hid the rest of the header). */}
          <span role="columnheader" className="upto900:hidden" />
          <span role="columnheader" className="text-right">
            Time
          </span>
          {!coop && <span role="columnheader" className="upto900:hidden" />}
        </div>
        {board.isPending ? (
          <Loading />
        ) : board.isError ? (
          <ErrorState error={board.error} onRetry={() => void board.refetch()} />
        ) : visible.length ? (
          visible.map((e) => {
            const key = rowKey(e)
            const open = opened?.key === key
            const { players, rolesKnown } = coopRoles(e, overrides)
            // Unpaired co-op runs have no partner on record; the cell keeps the columns lined up.
            const cells = coop && players.length < 2 ? [...players, null] : players
            return (
              <div
                key={key}
                data-board-entry
                data-open={open || undefined}
                className={cn(mine(e) && '[&>[role=row]]:me-row [&>[role=row]]:me-row-outside')}
              >
                <div
                  role="row"
                  aria-expanded={open}
                  onClick={(ev) => {
                    // Co-op: a click on a player's side opens (or switches to) their POV.
                    const pov = (ev.target as Element).closest<HTMLElement>('[data-pov]')?.dataset.pov ?? null
                    toggleOnRowClick(() =>
                      setOpened(open && (!pov || pov === opened?.pov) ? null : { key, pov }),
                    )(ev)
                  }}
                  className={cn(
                    rowBase,
                    'cursor-pointer hover:brightness-[1.15]',
                    // Legacy's board isn't striped: its two stripe rules tie, and the later one (the
                    // translucent panel) matches every entry's row.
                    open ? 'bg-seg-active' : 'bg-row-stripe',
                  )}
                >
                  <span role="cell" className="num flex justify-center text-[15px]">
                    <RankPoints points={e.points}>
                      <RankTag rank={e.rank} className={BOARD_TAG} />
                    </RankPoints>
                  </span>
                  {cells.map((p, j) => {
                    if (!p) {
                      return (
                        <span
                          key={j}
                          role="cell"
                          className="pl-3 text-text-muted"
                          title="No partner on record"
                        >
                          —
                        </span>
                      )
                    }
                    const pb = Boolean(coop && p.profileNumber && !notPb.get(e)?.has(p.profileNumber))
                    // The player's own half (staff may have swapped who was blue: by player, not place).
                    const half = coop ? e.halves?.[e.players.indexOf(p)] : undefined
                    const tint = tintFor(rolesKnown && players.length > 1, j)
                    const marked = pb && pbStyle === 'border'
                    return (
                      <span
                        key={j}
                        role="cell"
                        data-pov={(coop && p.profileNumber) || undefined}
                        title={
                          [
                            pb && `${p.name} set a PB`,
                            coop && !pb && p.profileNumber && `Not ${p.name}'s PB`,
                            coop && !rolesKnown && 'Unknown which player was blue',
                          ]
                            .filter(Boolean)
                            .join('. ') || undefined
                        }
                        className={cn(
                          'flex min-w-0 items-center gap-3 self-stretch overflow-hidden whitespace-nowrap [&>a]:truncate [&>span]:truncate',
                          coop && TINT_BG[tint],
                          coop &&
                            'upto900:gap-1.5 upto900:text-sm upto900:[--tint-at:24px] upto480:[--tint-at:18px]',
                        )}
                      >
                        <Avatar
                          src={p.avatar}
                          name={p.name}
                          size={30}
                          // Smaller on phones, leaving co-op names room beside the trophy.
                          className={cn(coop && 'upto900:size-6! upto480:size-[18px]!')}
                        />
                        <PlayerLink
                          player={p}
                          className={cn(
                            marked && PB_NAME,
                            coop && pbStyle === 'border' && !pb && NOT_PB_NAME,
                          )}
                          style={marked ? pbNameVars(tint) : undefined}
                        />
                        {half?.changelogId != null && (
                          <span className="ml-auto flex shrink-0 items-center gap-2 pr-1 upto900:hidden [&_svg]:block">
                            <CommentButton note={half.note} size={20} />
                            <AutorenderLink run={half} game={map.game} rendered={rendered} size={20} />
                            <YouTubeLink id={half.youtubeId} size={20} />
                            <DemoLink demoId={half.demoId} size={20} />
                          </span>
                        )}
                        {pb && pbStyle === 'icon' && (
                          <TrophyFilledIcon
                            role="img"
                            aria-label="PB"
                            className={cn(
                              'mr-2.5 size-[17px] shrink-0 upto480:mr-1 upto480:size-3.5',
                              half?.changelogId != null ? 'upto900:ml-auto' : 'ml-auto',
                            )}
                            style={{ color: pbColor(tint) }}
                          />
                        )}
                      </span>
                    )
                  })}
                  <span
                    role="cell"
                    className="text-base font-light whitespace-nowrap text-text-muted upto900:hidden"
                    title={formatDateTime(e.timestamp)}
                    style={{ color: ageColor(e.timestamp) }}
                  >
                    {timeAgo(e.timestamp)}
                  </span>
                  <span role="cell" className="num text-right font-semibold">
                    <TimeButton score={e.score} players={players} map={map} />
                  </span>
                  {!coop && (
                    <span role="cell" className="flex justify-end gap-2.5 upto900:hidden">
                      <CommentButton note={e.note} />
                      <AutorenderLink run={e} game={map.game} rendered={rendered} />
                      <YouTubeLink id={e.youtubeId} />
                      <DemoLink demoId={e.demoId} />
                    </span>
                  )}
                </div>
                {open && renderRunDetails?.(e, map, rendered, opened.pov)}
              </div>
            )
          })
        ) : (
          <EmptyState>No scores found.</EmptyState>
        )}
      </div>
      {hasMore && !board.isPending && <ListEnd endRef={end} testId="board-more" />}
    </>
  )
}

/** The signed-in player's best on this map, pinned above the board. */
function YourBest({
  map,
  board,
  onShow,
}: {
  map: MapInfo
  board: RankedRun[] | undefined
  onShow: (entry: RankedRun) => void
}) {
  const user = useCurrentUser()
  const me = user && !user.sample ? user.profileNumber : null
  const entry = me ? board?.find((e) => e.players.some((p) => p.profileNumber === me)) : undefined
  // Off the loaded board: the player's recorded PB (Portal 2 only).
  const pbs = useQuery({
    ...profileScoresQueryOptions(me ?? ''),
    enabled: Boolean(me && board && !entry && map.game === 'portal2'),
  })
  if (!me || !board) return null
  const pb = entry ? undefined : pbs.data?.find((p) => p.map_id === map.id)
  const box =
    'mb-4 flex w-full flex-wrap items-center gap-x-[18px] gap-y-1.5 rounded-md border px-4 py-2.5 text-left text-lg'
  if (!entry && !pb) {
    return (
      <div className={cn(box, 'border-line bg-panel-soft text-base text-text-muted')}>
        You don’t have a time on this map yet.
      </div>
    )
  }
  const score = entry ? entry.score : pb!.score
  const rank = entry ? entry.rank : pb!.rank
  const when = entry ? entry.timestamp : pb!.timestamp
  const partner = entry?.players.find((p) => p.profileNumber !== me)
  const body = (
    <>
      <span className="text-sm text-brand-light uppercase">Your best</span>
      <span className="num min-w-7 font-semibold">
        <RankNumber rank={rank} colored />
      </span>
      <span className="num font-semibold">{formatScore(score)}</span>
      {partner && <span className="text-text-muted">with {partner.name}</span>}
      <span className="text-text-muted" title={formatDateTime(when)} style={{ color: ageColor(when) }}>
        {timeAgo(when)}
      </span>
      {entry ? (
        <span className="ml-auto text-base text-brand-light">Show on board ›</span>
      ) : (
        <span className="text-text-muted">outside the top {board.length}</span>
      )}
    </>
  )
  return entry ? (
    <button
      type="button"
      onClick={() => onShow(entry)}
      className={cn(box, 'cursor-pointer border-brand bg-panel-soft text-foreground hover:bg-seg-hover')}
    >
      {body}
    </button>
  ) : (
    <div className={cn(box, 'border-brand bg-panel-soft')}>{body}</div>
  )
}
