import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { cn } from 'cn'
import { useMemo, type ReactNode } from 'react'
import { HistoryIcon } from '@/components/icons'
import { Pagination } from '@/components/pagination'
import { Panel } from '@/components/panel'
import { SearchBox } from '@/components/search-box'
import { EmptyState, ErrorState, Loading } from '@/components/status'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useDebounced } from '@/hooks/use-debounced'
import { useGame } from '@/hooks/use-game'
import { useRenderedSet } from '@/hooks/use-rendered-set'
import { useCatalog } from '@/lib/catalog'
import { changelogQueryOptions } from '@/lib/runs/changelog'
import { myReactionsQueryOptions } from '@/lib/runs/reactions'
import type { Run } from '@/types/runs'
import {
  applyFilterChanges,
  changelogFilters,
  isFiltered,
  readFilters,
  type FilterChanges,
  type ScoreUpdatesSearch,
} from '../utils/filters'
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

  const entries = useMemo(() => mergeCoopHalves(changelog.data ?? []), [changelog.data])
  const pageCount = Math.ceil(entries.length / PAGE_SIZE)
  const page = filters.page
  const visible = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const rendered = useRenderedSet(visible, game)
  // Which of the visible runs the signed-in player reacted to (one request per page).
  const me = useCurrentUser()
  const signedIn = Boolean(me) && !me?.sample
  const mine = useQuery({
    ...myReactionsQueryOptions(visible.map((e) => e.id)),
    enabled: signedIn && visible.length > 0,
  })
  const setPage = (p: number) => set({ page: String(p) })
  const filtered = isFiltered(filters, query)

  return (
    <Panel icon={HistoryIcon} title="Score Updates" bodyClassName="p-[26px] pb-[30px] max-[900px]:p-3">
      <div className="mb-[22px] flex items-center justify-between gap-4 max-[900px]:mb-2.5 max-[900px]:grid max-[900px]:grid-cols-[minmax(0,1fr)] max-[900px]:gap-2.5 max-[900px]:[&>nav]:hidden">
        <SearchBox
          value={filters.q}
          onChange={(v) => set({ q: v })}
          placeholder="Search players"
          showFilter={false}
        />
        <Pagination page={page} pageCount={pageCount} onChange={setPage} />
      </div>

      <ScoreFilters filters={filters} query={query} modes={modes} set={set} />

      <div
        role="table"
        aria-label="Score updates"
        className="[--su-cols:83px_83px_minmax(170px,1.2fr)_minmax(220px,2.3fr)_110px_100px_90px_150px_156px_44px] max-[1400px]:[--su-cols:70px_70px_minmax(150px,1.2fr)_minmax(180px,2fr)_96px_86px_76px_132px_124px_40px]"
      >
        <div
          role="row"
          className={cn(
            SCORE_COLS,
            'h-[30px] text-base text-text-muted uppercase max-[900px]:hidden [&>span]:px-2.5 [&>span:nth-child(-n+2)]:text-center',
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
              myReaction={mine.data?.[entry.id]}
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
        <div className="mt-[22px] flex justify-end max-[900px]:mb-2.5 max-[900px]:justify-center">
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </div>
      )}
    </Panel>
  )
}
