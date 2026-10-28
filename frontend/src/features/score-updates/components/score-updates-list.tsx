import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { cn } from 'cn'
import { useMemo, useState, type ReactNode } from 'react'
import { HistoryIcon } from '@/components/icons'
import { Pagination } from '@/components/pagination'
import { Panel } from '@/components/panel'
import { PlayerSuggestions } from '@/components/player-suggestions'
import { SearchBox } from '@/components/search-box'
import { EmptyState, ErrorState, Loading } from '@/components/status'
import { useDebounced } from '@/hooks/use-debounced'
import { useGame } from '@/hooks/use-game'
import { useRenderedSet } from '@/hooks/use-rendered-set'
import { useCatalog } from '@/lib/catalog'
import { changelogQueryOptions } from '@/lib/runs/changelog'
import type { UserHit } from '@/lib/users/search'
import type { Run } from '@/types/runs'
import {
  applyFilterChanges,
  changelogFilters,
  isFiltered,
  readFilters,
  type FilterChanges,
  type ScoreUpdatesSearch,
} from '../utils/filters'
import { groupStreaks } from '../utils/group-streaks'
import { mergeCoopHalves } from '../utils/merge-coop-halves'
import { ScoreFilters } from './score-filters'
import { SCORE_COLS, ScoreRow } from './score-row'

const PAGE_SIZE = 20

export function ScoreUpdatesList({
  search,
  renderRunDetails,
}: {
  search: ScoreUpdatesSearch
  renderRunDetails?: (run: Run, rendered: Map<number, string>) => ReactNode
}) {
  const catalog = useCatalog()
  const game = useGame()
  const navigate = useNavigate()
  const modes = catalog.games[game]?.modes ?? []
  const filters = readFilters(search, modes)
  const query = useDebounced(filters.q, 250)
  const changelog = useQuery(changelogQueryOptions(changelogFilters(filters, game, query), catalog))

  const set = (changes: FilterChanges) =>
    void navigate({
      to: '.',
      search: (prev) => applyFilterChanges(prev as ScoreUpdatesSearch, changes),
      replace: true,
    })

  // A player's session of PBs on one map is one row (pages count rows).
  const entries = useMemo(() => groupStreaks(mergeCoopHalves(changelog.data ?? [])), [changelog.data])
  const pageCount = Math.ceil(entries.length / PAGE_SIZE)
  const page = filters.page
  const visible = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const rendered = useRenderedSet(visible, game)
  const setPage = (p: number) => set({ page: String(p) })
  const filtered = isFiltered(filters, query)

  return (
    <Panel icon={HistoryIcon} title="Score Updates" bodyClassName="p-[26px] pb-[30px] upto900:p-3">
      <div className="mb-[22px] flex items-center justify-between gap-4 upto900:mb-2.5 upto900:grid upto900:grid-cols-[minmax(0,1fr)] upto900:gap-2.5 upto900:[&>nav]:hidden">
        <PlayerSearchBox
          value={filters.q}
          // Typing again searches names; picking a suggestion shows just that player's runs.
          onChange={(v) => set({ q: v, player: '' })}
          onPick={(p) => set({ q: p.name, player: p.profileNumber ?? '' })}
          picked={Boolean(filters.player)}
        />
        <Pagination page={page} pageCount={pageCount} onChange={setPage} />
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

      {pageCount > 1 && (
        <div className="mt-[22px] flex justify-end upto900:mb-2.5 upto900:justify-center">
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </div>
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
