import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { siteBackground } from '@/components/layouts/backgrounds'
import { Page } from '@/components/layouts/page'
import { PinIcon } from '@/components/icons'
import { Panel } from '@/components/panel'
import { SeasonSelect } from '@/components/season-select'
import { Segmented } from '@/components/segmented'
import { ErrorState, Loading } from '@/components/status'
import { useGame } from '@/hooks/use-game'
import { useSeason } from '@/hooks/use-season'
import { chaptersFor, isMultiplayerMode, modeLabel, seasonBoard, seasonsOf, useCatalog } from '@/lib/catalog'
import { mapPreviewsQueryOptions } from '../api/previews'
import { MapCard } from './map-card'

export interface MapListSearch {
  mode?: string
  season?: string
  game?: string
}

/** Every map of the selected game (or one of its seasons), by chapter, with each map's top times. */
export function MapListPage({ search }: { search: MapListSearch }) {
  const catalog = useCatalog()
  const navigate = useNavigate()
  const game = useGame()
  const picked = useSeason(game)
  // An old ?game=<season> link: its game with the season picked.
  const raw = search.game ? catalog.games[search.game] : undefined
  const oldSeason = raw?.kind === 'season' && raw.base && catalog.games[raw.base] ? raw.id : null
  const season = oldSeason ?? picked
  const modes = catalog.games[game]?.modes ?? []
  const mode = modes.includes(search.mode ?? '') ? search.mode! : (modes[0] ?? 'sp')
  // The season's copy of the board (null if the season has no such board).
  const board = season ? seasonBoard(catalog, season, game, mode) : mode
  const previews = useQuery({ ...mapPreviewsQueryOptions(board ?? '', catalog), enabled: Boolean(board) })
  const chapters = board ? chaptersFor(catalog, board) : []

  // Like legacy: the address keeps only the mode (when not the first) and the season.
  const update = (nextMode: string, nextSeason: string | null = season) =>
    void navigate({
      to: '.',
      search: {
        ...(nextMode !== modes[0] ? { mode: nextMode } : {}),
        ...(nextSeason ? { season: nextSeason } : {}),
      },
      replace: true,
    })

  return (
    <Page background={siteBackground} tint="mono">
      <Panel icon={PinIcon} title="Leaderboards" bodyClassName="p-0 pb-10">
        <div className="flex flex-wrap gap-x-7 gap-y-[18px] bg-[rgb(var(--page-rgb)/0.55)] px-10 py-[26px] upto700:px-3.5 upto700:py-[18px]">
          {seasonsOf(catalog, game).length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[22px] font-light uppercase">Season</span>
              <SeasonSelect base={game} season={season} onChange={(s) => update(mode, s)} size="xl" />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="text-[22px] font-light uppercase">Mode</span>
            <Segmented
              value={mode}
              onChange={(m) => update(m)}
              label="Mode"
              options={modes.map((m) => ({ value: m, label: modeLabel(catalog, m) }))}
            />
          </div>
        </div>

        {previews.isPending && board && <Loading />}
        {previews.isError && <ErrorState error={previews.error} onRetry={() => void previews.refetch()} />}
        {season && !board && (
          // A plain paragraph in legacy, with the browser's 1em margins.
          <p className="my-4 text-text-muted">
            {catalog.games[season]?.label} has no {modeLabel(catalog, mode)} maps.
          </p>
        )}

        {chapters.map((chapter) => (
          <section
            key={chapter.dbId ?? `${chapter.mode}-${chapter.number}`}
            className="mt-[34px] px-10 upto700:px-3.5"
          >
            <header className="mb-[18px] border-b border-foreground pb-1.5 upto700:mb-3">
              <span className="text-[26px] font-light uppercase">
                {isMultiplayerMode(catalog, mode) ? 'Course' : 'Chapter'}{' '}
                {String(chapter.number).padStart(2, '0')}
              </span>
              <h2 className="-mt-1 mb-0 text-[44px] leading-[1.1] font-semibold uppercase upto700:text-[32px]">
                {chapter.name}
              </h2>
            </header>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-10 gap-y-9 upto700:grid-cols-2 upto700:gap-x-2.5 upto700:gap-y-3">
              {chapter.maps.map((map) => (
                <MapCard key={map.id} map={map} scores={previews.data?.[map.id]} />
              ))}
            </div>
          </section>
        ))}
      </Panel>
    </Page>
  )
}
