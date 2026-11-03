import { useInfiniteQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { cn } from 'cn'
import { useMemo, useState } from 'react'
import { HistoryIcon } from '@/components/icons'
import { ListEnd } from '@/components/list-end'
import { Panel } from '@/components/panel'
import { PlayerSuggestions } from '@/components/player-suggestions'
import { SearchBox } from '@/components/search-box'
import { EmptyState, ErrorState, Loading } from '@/components/status'
import { useDebounced } from '@/hooks/use-debounced'
import { useGame } from '@/hooks/use-game'
import { endlessPages, useEndlessRows } from '@/hooks/use-endless-rows'
import { useRenderedSet } from '@/hooks/use-rendered-set'
import { useCatalog } from '@/lib/catalog'
import { changelogPagesQueryOptions } from '@/lib/runs/changelog'
import type { UserHit } from '@/lib/users/search'
import {
  applyFilterChanges,
  changelogFilters,
  isFiltered,
  readFilters,
  type FilterChanges,
  type ScoreUpdatesSearch,
} from '../utils/filters'
import { groupStreaks } from '@/lib/runs/group-streaks'
import { mergeCoopHalves } from '../utils/merge-coop-halves'
import { ScoreFilters } from './score-filters'
import { SCORE_COLS, ScoreRow, type RenderScoreDetails } from './score-row'

// Rows show this many at a time, as many more each time the list's end scrolls near.
const STEP = 20

export function ScoreUpdatesList({
  search,
  renderRunDetails,
}: {
  search: ScoreUpdatesSearch
  renderRunDetails?: RenderScoreDetails
}) {
  const catalog = useCatalog()
  const game = useGame()
  const navigate = useNavigate()
  const modes = catalog.games[game]?.modes ?? []
  const filters = readFilters(search, modes)
  const query = useDebounced(filters.q, 250)
  const asked = changelogFilters(filters, game, query)
  const changelog = useInfiniteQuery(changelogPagesQueryOptions(asked, catalog))

  const set = (changes: FilterChanges) =>
    void navigate({
      to: '.',
      search: (prev) => applyFilterChanges(prev as ScoreUpdatesSearch, changes),
      replace: true,
    })

  // A player's session of PBs on one map is one row (the steps count rows).
  const loaded = useMemo(() => changelog.data?.pages.flatMap((p) => p.runs) ?? [], [changelog.data])
  const all = useMemo(() => groupStreaks(mergeCoopHalves(loaded)), [loaded])
  // While older runs may follow, the last row waits: its co-op partner or earlier PBs may be on
  // the next page.
  const entries = changelog.hasNextPage ? all.slice(0, -1) : all
  // Other filters start again from the top rows (a refetch of the same ones keeps what's shown).
  const { visible, hasMore, end } = useEndlessRows({
    rows: entries,
    resetKey: JSON.stringify(asked),
    step: STEP,
    pages: endlessPages(changelog),
  })
  const rendered = useRenderedSet(
    visible.flatMap((e) => [e, ...e.earlier]),
    game,
  )
  const filtered = isFiltered(filters, query)

  return (
    <Panel icon={HistoryIcon} title="Score Updates" bodyClassName="p-[26px] pb-[30px] upto900:p-3">
      <div className="mb-[22px] flex items-center justify-between gap-4 upto900:mb-2.5 upto900:grid upto900:grid-cols-[minmax(0,1fr)] upto900:gap-2.5">
        <PlayerSearchBox
          value={filters.q}
          // Typing again searches names; picking a suggestion shows just that player's runs.
          onChange={(v) => set({ q: v, player: '' })}
          onPick={(p) => set({ q: p.name, player: p.profileNumber ?? '' })}
          picked={Boolean(filters.player)}
        />
      </div>

      <ScoreFilters filters={filters} query={query} modes={modes} set={set} />

      <div
        role="table"
        aria-label="Score updates"
        className="[--su-cols:83px_83px_minmax(170px,1.2fr)_minmax(220px,2.3fr)_110px_100px_90px_150px_48px_44px] upto1400:[--su-cols:70px_70px_minmax(150px,1.2fr)_minmax(180px,2fr)_96px_86px_76px_132px_44px_40px]"
      >
        <div
          role="row"
          className={cn(
            SCORE_COLS,
            'h-[30px] text-base text-text-muted uppercase upto900:hidden [&>span]:px-2.5 [&>span:nth-child(-n+2)]:text-center',
          )}
        >
          <span role="columnheader">Previous</span>
          <span role="columnheader">New</span>
          <span role="columnheader">Map</span>
          <span role="columnheader">Player(s)</span>
          <span role="columnheader" className="text-right">
            Time
          </span>
          <span role="columnheader" className="text-right">
            ΔTime
          </span>
          <span role="columnheader" className="text-right">
            ΔPoints
          </span>
          <span role="columnheader" className="text-right">
            Date
          </span>
        </div>
        {changelog.isPending ? (
          <Loading />
        ) : changelog.isError ? (
          <ErrorState error={changelog.error} onRetry={() => void changelog.refetch()} />
        ) : visible.length ? (
          visible.map((entry) => (
            <ScoreRow
              key={`${entry.game}-${entry.id}`}
              entry={entry}
              rendered={rendered}
              renderRunDetails={renderRunDetails}
            />
          ))
        ) : (
          <EmptyState>
            {filtered ? 'No score updates match these filters.' : 'No score updates yet.'}
          </EmptyState>
        )}
      </div>

      {/* Scrolling near here shows the next rows. */}
      {hasMore && !changelog.isPending && (
        <ListEnd
          endRef={end}
          failed={changelog.isFetchNextPageError}
          onRetry={() => void changelog.fetchNextPage()}
          testId="score-updates-more"
        />
      )}
    </Panel>
  )
}

/**
 * The "Search players" box: it filters the feed by name as you type, and lists the matching
 * players to pick one from (like Compare's), closing once one is picked or the box is left.
 */
function PlayerSearchBox({
  value,
  onChange,
  onPick,
  picked,
}: {
  value: string
  onChange: (value: string) => void
  onPick: (player: UserHit) => void
  picked: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="relative w-[min(428px,100%)]"
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      <SearchBox
        value={value}
        onChange={(v) => {
          onChange(v)
          setOpen(true)
        }}
        placeholder="Search players"
        showFilter={false}
      />
      {open && !picked && (
        <PlayerSuggestions
          q={value}
          label="Matching players"
          onPick={(p) => {
            setOpen(false)
            onPick(p)
          }}
        />
      )}
    </div>
  )
}
