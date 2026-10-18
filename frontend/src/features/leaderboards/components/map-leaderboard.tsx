import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { cn } from 'cn'
import { useState, type ReactNode } from 'react'
import { Avatar } from '@/components/avatar'
import { Pagination } from '@/components/pagination'
import { PlayerLink } from '@/components/player-link'
import { RankNumber } from '@/components/rank'
import { AutorenderLink, CommentButton, DemoLink, YouTubeLink } from '@/components/runs/run-media'
import { TimeButton } from '@/components/runs/time-button'
import { SearchBox } from '@/components/search-box'
import { EmptyState, ErrorState, Loading } from '@/components/status'
import { useCoopRoleOverrides } from '@/hooks/use-coop-role-overrides'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useRenderedSet } from '@/hooks/use-rendered-set'
import { isMultiplayerMode, useCatalog, type MapInfo } from '@/lib/catalog'
import { coopRoles, tintFor } from '@/lib/coop-roles'
import { formatDateTime, formatScore, timeAgo } from '@/lib/format'
import { toggleOnRowClick } from '@/lib/rows'
import { profileScoresQueryOptions } from '@/lib/runs/profile-scores'
import type { RankedRun } from '@/types/runs'
import { headBase, PAGE_SIZE, rowBase, TINT_BG } from '../utils/board-styles'

export type RenderRunDetails = (run: RankedRun, map: MapInfo, rendered: Map<number, string>) => ReactNode

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
  const [page, setPage] = useState(0)
  const coop = isMultiplayerMode(catalog, map.mode)
  const q = search.trim().toLowerCase()
  const all = board.data ?? []
  const rows = all.filter((e) => !q || e.players.some((p) => p.name.toLowerCase().includes(q)))
  const pageCount = Math.ceil(rows.length / PAGE_SIZE)
  const visible = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const rendered = useRenderedSet(visible, map.game)
  const [openKey, setOpenKey] = useState<string | number | null>(null)
  const overrides = useCoopRoleOverrides()
  const rowKey = (e: RankedRun) =>
    e.changelogId ?? `${e.rank}-${e.players.map((p) => p.profileNumber).join('-')}`

  // Jump to a board entry: clear the search, go to its page and open its details.
  const showEntry = (entry: RankedRun) => {
    const index = all.indexOf(entry)
    if (index < 0) return
    setSearch('')
    setPage(Math.floor(index / PAGE_SIZE))
    setOpenKey(rowKey(entry))
    setTimeout(
      () =>
        document
          .querySelector('[data-board-entry][data-open]')
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
      50,
    )
  }

  const cols = coop
    ? '[--mp-cols:40px_minmax(0,1fr)_minmax(0,1fr)_minmax(90px,0.6fr)_80px_150px] upto900:[--mp-cols:28px_minmax(0,1fr)_minmax(0,1fr)_58px]'
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
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v)
            setPage(0)
          }}
          placeholder="Search players"
        />
        <Pagination page={page} pageCount={pageCount} onChange={setPage} />
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
          <span role="columnheader" className="upto900:hidden" />
        </div>
        {board.isPending ? (
          <Loading />
        ) : board.isError ? (
          <ErrorState error={board.error} onRetry={() => void board.refetch()} />
        ) : visible.length ? (
          visible.map((e) => {
            const key = rowKey(e)
            const open = openKey === key
            const { players, rolesKnown } = coopRoles(e, overrides)
            // Unpaired co-op runs have no partner on record; the cell keeps the columns lined up.
            const cells = coop && players.length < 2 ? [...players, null] : players
            return (
              <div
                key={key}
                data-board-entry
                data-open={open || undefined}
                className={cn(mine(e) && '[&>[role=row]]:me-row')}
              >
                <div
                  role="row"
                  aria-expanded={open}
                  onClick={toggleOnRowClick(() => setOpenKey(open ? null : key))}
                  className={cn(
                    rowBase,
                    'cursor-pointer hover:brightness-[1.15]',
                    // Legacy's board isn't striped: its two stripe rules tie, and the later one (the
                    // translucent panel) matches every entry's row.
                    open ? 'bg-seg-active' : 'bg-[rgb(var(--panel-rgb)/0.9)]',
                  )}
                >
                  <span role="cell" className="num text-center text-[15px]">
                    <RankNumber rank={e.rank} colored />
                  </span>
                  {cells.map((p, j) =>
                    p ? (
                      <span
                        key={j}
                        role="cell"
                        title={coop && !rolesKnown ? 'Unknown which player was blue' : undefined}
                        className={cn(
                          'flex min-w-0 items-center gap-3 self-stretch overflow-hidden whitespace-nowrap [&>a]:truncate [&>span]:truncate',
                          coop && TINT_BG[tintFor(rolesKnown && players.length > 1, j)],
                          coop && 'upto900:gap-1.5 upto900:text-sm',
                        )}
                      >
                        <Avatar
                          src={p.avatar}
                          name={p.name}
                          size={30}
                          className={cn(coop && 'upto900:size-6!')}
                        />
                        <PlayerLink player={p} />
                      </span>
                    ) : (
                      <span key={j} role="cell" className="pl-3 text-text-muted" title="No partner on record">
                        —
                      </span>
                    ),
                  )}
                  <span
                    role="cell"
                    className="text-base font-light whitespace-nowrap text-text-muted upto900:hidden"
                    title={formatDateTime(e.timestamp)}
                  >
                    {timeAgo(e.timestamp)}
                  </span>
                  <span role="cell" className="num text-right font-semibold">
                    <TimeButton score={e.score} players={players} map={map} />
                  </span>
                  <span role="cell" className="flex justify-end gap-2.5 upto900:hidden">
                    <CommentButton note={e.note} />
                    <AutorenderLink run={e} game={map.game} rendered={rendered} />
                    <YouTubeLink id={e.youtubeId} />
                    <DemoLink demoId={e.demoId} />
                  </span>
                </div>
                {open && renderRunDetails?.(e, map, rendered)}
              </div>
            )
          })
        ) : (
          <EmptyState>No scores found.</EmptyState>
        )}
      </div>
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
      <div className={cn(box, 'border-line bg-[rgb(var(--panel-rgb)/0.6)] text-base text-text-muted')}>
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
      <span className="text-text-muted" title={formatDateTime(when)}>
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
      className={cn(
        box,
        'cursor-pointer border-brand bg-[rgb(var(--panel-rgb)/0.6)] text-foreground hover:bg-seg-hover',
      )}
    >
      {body}
    </button>
  ) : (
    <div className={cn(box, 'border-brand bg-[rgb(var(--panel-rgb)/0.6)]')}>{body}</div>
  )
}
