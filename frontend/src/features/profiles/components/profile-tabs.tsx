import { useQuery } from '@tanstack/react-query'
import { cn } from 'cn'
import { useState, type ReactNode } from 'react'
import { SeasonSelect } from '@/components/season-select'
import { Segmented } from '@/components/segmented'
import { Select } from '@/components/select'
import { EmptyState, Loading } from '@/components/status'
import { useGame } from '@/hooks/use-game'
import { useRenderedSet } from '@/hooks/use-rendered-set'
import { useSeason } from '@/hooks/use-season'
import {
  chapterHasBoard,
  chaptersFor,
  isMultiplayerMode,
  modeLabel,
  PORTAL2,
  seasonBoard,
  useCatalog,
  type Chapter,
  type MapInfo,
} from '@/lib/catalog'
import { gameResultsQueryOptions } from '../api/profile'
import type { Profile, ProfilePlayer, RenderRunDetails } from '../types'
import { InfoTab } from './info-tab'
import { LegacyTab } from './legacy-tab'
import { ProfileHistory } from './profile-history'
import { StatsTab } from './stats-tab'
import { MAP_SORTS, orderedChapters } from '../utils/map-sort'
import { chapterBoardPath } from '../utils/tables'
import { ChapterTable, SectionTitle, Summary } from './score-tables'

const CATEGORIES = [{ value: 'p2cm', label: 'Portal 2 Challenge Mode' }]
interface TabState {
  sort: string
  onSort: (sort: string) => void
  selectedMap: MapInfo | null
  onSelectMap: (map: MapInfo | null) => void
  onSeason: (season: string | null) => void
  renderRunDetails?: RenderRunDetails
}

/**
 * The tabs for the game picked under the logo: Portal 2's two boards (and its old board's Legacy
 * view), or another game's results in one tab; then Stats and Info. Seasons are picked inside the
 * game's tabs, not tabs of their own. A fresh set (season, sort, selection) for each game.
 */
export function ProfileTabs(props: { profile: Profile; renderRunDetails?: RenderRunDetails }) {
  const game = useGame()
  return <GameProfileTabs key={game} game={game} {...props} />
}

function profileTabs(label: string | undefined, game: string) {
  return [
    ...(game === PORTAL2
      ? [
          { key: 'sp', label: 'Singleplayer' },
          { key: 'coop', label: 'Cooperative' },
        ]
      : [{ key: `game:${game}`, label: label ?? game }]),
    { key: 'stats', label: 'Stats' },
    ...(game === PORTAL2 ? [{ key: 'legacy', label: 'Legacy' }] : []),
    { key: 'info', label: 'Info' },
  ]
}

const P2_MODES = ['sp', 'coop']

function GameProfileTabs({
  game,
  profile,
  renderRunDetails,
}: {
  game: string
  profile: Profile
  renderRunDetails?: RenderRunDetails
}) {
  const catalog = useCatalog()
  const tabs = profileTabs(catalog.games[game]?.label, game)
  const [tab, setTab] = useState(tabs[0]!.key)
  const [sort, setSort] = useState('default')
  const [selectedMap, setSelectedMap] = useState<MapInfo | null>(null)
  // The season picked in the current tab (a ?season= link opens the game's tabs on it).
  const linked = useSeason(game)
  const [season, setSeason] = useState(linked)
  const state: TabState = {
    sort,
    onSort: setSort,
    selectedMap,
    onSelectMap: setSelectedMap,
    onSeason: (s) => {
      setSeason(s)
      setSelectedMap(null)
    },
    renderRunDetails,
  }
  const player = profile.player

  return (
    <section className="mt-[30px]">
      <div className="flex gap-1.5 overflow-x-auto" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={cn(
              'h-[46px] min-w-[124px] flex-none cursor-pointer rounded-t-[10px] border-0 px-7 text-lg font-light text-text-2 uppercase upto900:min-w-0 upto900:px-4 upto900:text-base',
              tab === t.key ? 'bg-panel-body text-foreground' : 'bg-control-raised',
            )}
            onClick={(e) => {
              // On a phone the tabs scroll sideways: keep the picked one in view.
              e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
              setTab(t.key)
              setSelectedMap(null)
              // Singleplayer and Cooperative share Portal 2's season; another game starts on all-time.
              if (!(P2_MODES.includes(tab) && P2_MODES.includes(t.key))) setSeason(null)
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        className="glass rounded-[0_12px_12px_12px] bg-panel-body px-9 pt-[26px] pb-10 upto800:px-2.5 upto800:pt-4 upto800:pb-6"
        role="tabpanel"
      >
        {P2_MODES.includes(tab) && season ? (
          <GameTab
            key={`${tab}-${season}`}
            game={PORTAL2}
            fixedMode={tab}
            season={season}
            player={player}
            {...state}
          />
        ) : P2_MODES.includes(tab) ? (
          <ModeTab mode={tab} profile={profile} {...state} />
        ) : tab.startsWith('game:') ? (
          <GameTab
            key={`${tab}-${season ?? ''}`}
            game={tab.slice(5)}
            season={season}
            player={player}
            {...state}
          />
        ) : tab === 'stats' ? (
          <StatsTab
            profileNumber={player.profileNumber}
            game={game}
            portal2History={profile.history}
            portal2Scores={profile.scores}
          />
        ) : tab === 'legacy' ? (
          <LegacyTab scores={profile.scores} player={player} renderRunDetails={renderRunDetails} />
        ) : (
          <InfoTab player={player} />
        )}
      </div>
    </section>
  )
}

function Controls({ children }: { children: ReactNode }) {
  // On a phone each control takes the full width, so they line up.
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-3 upto480:*:w-full">{children}</div>
}

function SortSelect({ sort, onSort }: { sort: string; onSort: (sort: string) => void }) {
  return <Select value={sort} onChange={onSort} options={MAP_SORTS} label="Sort maps" />
}

function CategorySelect() {
  return <Select value="p2cm" onChange={() => {}} options={CATEGORIES} label="Category" />
}

/** Portal 2's Singleplayer / Cooperative tab, all-time: the profile's own scores. */
function ModeTab({
  mode,
  profile,
  sort,
  onSort,
  selectedMap,
  onSelectMap,
  onSeason,
  renderRunDetails,
}: TabState & { mode: string; profile: Profile }) {
  const catalog = useCatalog()
  const chapters = chaptersFor(catalog, mode)
  const rendered = useRenderedSet(Object.values(profile.scores), PORTAL2)
  const link = (c: Chapter) => chapterBoardPath(c, profile.player)
  return (
    <>
      <Controls>
        <CategorySelect />
        <SeasonSelect base={PORTAL2} season={null} onChange={onSeason} />
        <SortSelect sort={sort} onSort={onSort} />
      </Controls>
      <SectionTitle>Summary</SectionTitle>
      <Summary chapters={chapters} scores={profile.scores} onSelectMap={onSelectMap} chapterLink={link} />
      {orderedChapters(chapters, profile.scores, sort).map((chapter) => (
        <ChapterTable
          key={chapter.dbId ?? `${chapter.mode}-${chapter.name}`}
          chapter={chapter}
          scores={profile.scores}
          coop={mode === 'coop'}
          game={PORTAL2}
          rendered={rendered}
          selectedMap={selectedMap}
          onSelectMap={onSelectMap}
          player={profile.player}
          // A sorted table lists every chapter's maps: no one chapter's board to link to.
          chapterLink={chapter.sorted ? undefined : link(chapter)}
          sort={sort}
          onSort={onSort}
          renderRunDetails={renderRunDetails}
        />
      ))}
      <div className="mt-[30px]">
        <ProfileHistory history={profile.history} game={PORTAL2} map={selectedMap} />
      </div>
    </>
  )
}

/**
 * Results in another game (Mel, ...), board by board; or with a season picked, the season's
 * results on its copies of the game's boards. `fixedMode`: one board only (Portal 2's
 * Singleplayer / Cooperative tabs with a season picked).
 */
function GameTab({
  game,
  fixedMode = null,
  season = null,
  player,
  sort,
  onSort,
  selectedMap,
  onSelectMap,
  onSeason,
  renderRunDetails,
}: TabState & { game: string; fixedMode?: string | null; season?: string | null; player: ProfilePlayer }) {
  const catalog = useCatalog()
  const modes = catalog.games[game]?.modes ?? []
  const [picked, setMode] = useState(modes[0] ?? '')
  const mode = fixedMode ?? picked
  const source = season ?? game
  const board = season ? seasonBoard(catalog, season, game, mode) : mode
  const results = useQuery(gameResultsQueryOptions(catalog, player.profileNumber, source))
  const label = catalog.games[source]?.label ?? source
  const controls = (
    <Controls>
      {!fixedMode && (
        <Segmented
          value={mode}
          onChange={setMode}
          label="Board"
          className="mb-1"
          options={modes.map((m) => ({ value: m, label: modeLabel(catalog, m) }))}
        />
      )}
      {fixedMode && <CategorySelect />}
      <SeasonSelect base={game} season={season} onChange={onSeason} />
      <SortSelect sort={sort} onSort={onSort} />
    </Controls>
  )
  if (results.isPending) return <Loading label={`Loading ${label} results`} />
  const scores = results.data?.scores ?? {}
  const chapters = board ? chaptersFor(catalog, board) : []
  const link = (c: Chapter) => (chapterHasBoard(catalog, c) ? chapterBoardPath(c, player) : undefined)
  if (!Object.keys(scores).length || !board) {
    return (
      <>
        {controls}
        <EmptyState>
          No {label}
          {season && fixedMode ? ` ${modeLabel(catalog, fixedMode)}` : ''} scores for this player.
        </EmptyState>
      </>
    )
  }
  return (
    <>
      {controls}
      <SectionTitle>Summary</SectionTitle>
      <Summary chapters={chapters} scores={scores} onSelectMap={onSelectMap} chapterLink={link} />
      {orderedChapters(chapters, scores, sort).map((chapter) => (
        <ChapterTable
          key={chapter.dbId ?? `${chapter.mode}-${chapter.name}`}
          chapter={chapter}
          scores={scores}
          coop={isMultiplayerMode(catalog, board)}
          game={source}
          selectedMap={selectedMap}
          onSelectMap={onSelectMap}
          player={player}
          chapterLink={chapter.sorted ? undefined : link(chapter)}
          sort={sort}
          onSort={onSort}
          renderRunDetails={renderRunDetails}
        />
      ))}
      <div className="mt-[30px]">
        <ProfileHistory history={results.data?.history ?? []} game={source} map={selectedMap} />
      </div>
    </>
  )
}
