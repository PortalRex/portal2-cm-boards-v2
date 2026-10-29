import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { cn } from 'cn'
import { useState } from 'react'
import { HistoryIcon, PinIcon, TrophyFilledIcon, WikiIcon } from '@/components/icons'
import { Page } from '@/components/layouts/page'
import { Redirect } from '@/components/redirect'
import { Panel } from '@/components/panel'
import { RunVideo } from '@/components/runs/run-media'
import { SeasonSelect } from '@/components/season-select'
import { Select } from '@/components/select'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useRenderedSet } from '@/hooks/use-rendered-set'
import { useSeason } from '@/hooks/use-season'
import { env } from '@/config/env'
import { isStaff } from '@/lib/auth'
import {
  findMap,
  gameForMode,
  getMap,
  isSeason,
  mapLink,
  mapPath,
  seasonMap,
  useCatalog,
  withSeason,
  type MapInfo,
} from '@/lib/catalog'
import { mapBoardQueryOptions, wrHistoryQueryOptions } from '../api/map-board'
import { ChamberHistory } from './chamber-history'
import { MapLeaderboard, type RenderRunDetails } from './map-leaderboard'
import { ReplayActions } from './replay-actions'
import { WrHistoryEditor } from './wr-history-editor'
import { WrHistoryChart } from './wr-history-chart'
import { toSecond } from '@/lib/charts/history'
import { replaySearch } from '@/lib/runs/viewer'
import type { RankedRun } from '@/types/runs'
import { raceReplay } from '../utils/replay'

const CATEGORIES = [{ value: 'main', label: 'Main Challenge Mode' }]
const MEL_CATEGORIES = [{ value: 'main', label: 'Challenge Mode' }]

/**
 * A map's page at /map/{mode}/{id}. Unknown maps go to the map list; a season's copy, a wrong mode
 * or a season the map isn't in are sent to the right address (legacy MapPage).
 */
export function MapPage({
  mode,
  levelId,
  at,
  renderRunDetails,
}: {
  mode: string
  levelId: string
  at: string | null
  renderRunDetails?: RenderRunDetails
}) {
  const catalog = useCatalog()
  const { searchStr } = useLocation()
  const map = getMap(catalog, levelId, gameForMode(catalog, mode)) ?? findMap(catalog, levelId)
  // ?season=: the season's copy of the map (its own board, WR history and chamber history).
  const season = useSeason(map?.game ?? '')
  if (!map) return <Redirect href="/maps" />
  // A season's copy opens as its base map with the season picked.
  if (isSeason(catalog, map.game)) {
    const link = mapLink(catalog, map)
    const href = link === mapPath(map) ? link : withSeason(`${link.split('?')[0]}${searchStr}`, map.game)
    return <Redirect href={href} />
  }
  if (map.mode !== mode) return <Redirect href={`${mapPath(map)}${searchStr}`} />
  const copy = season ? seasonMap(catalog, season, map.id) : null
  // Not in that season: the map's all-time board.
  if (season && !copy) return <Redirect href={withSeason(`${mapPath(map)}${searchStr}`, null)} />
  return (
    <MapPageContent
      key={`${map.game}-${map.id}-${season ?? ''}`}
      map={map}
      data={copy ?? map}
      season={season}
      at={at}
      renderRunDetails={renderRunDetails}
    />
  )
}

type View = 'board' | 'history' | 'wr'

const outlineButton =
  'inline-flex h-10 cursor-pointer items-center justify-center gap-2.5 rounded-[4px] border border-line-strong bg-control px-2.5 text-lg font-light whitespace-nowrap hover:bg-control-raised upto900:min-w-0 upto900:text-base [&_svg]:size-6 [&_svg]:shrink-0'

/** `map` is the map shown (title, image); `data` the board shown: the map, or the season's copy. */
function MapPageContent({
  map,
  data,
  season,
  at,
  renderRunDetails,
}: {
  map: MapInfo
  data: MapInfo
  season: string | null
  at: string | null
  renderRunDetails?: RenderRunDetails
}) {
  const catalog = useCatalog()
  const navigate = useNavigate()
  const user = useCurrentUser()
  const board = useQuery(mapBoardQueryOptions(data, catalog, at))
  const history = useQuery(wrHistoryQueryOptions(data, catalog))
  const [view, setView] = useState<View>('board')
  // Ticking runs on the board to race in the replay (where the demo viewer is built in).
  const [picking, setPicking] = useState(false)
  const racePicked = (runs: RankedRun[]) => {
    const replay = raceReplay(runs)
    if (replay)
      void navigate({ to: '/replay', search: replaySearch(replay, { map: data.id, what: 'picked' }) })
  }
  // ?at=: the board as it stood then (picked on the WR history chart). Keeps ?season= and the rest.
  const pickMoment = (t: number | null) => {
    void navigate({
      to: '.',
      search: (prev: Record<string, unknown>) => {
        const next = { ...prev }
        if (t) next.at = new Date(toSecond(t)).toISOString().slice(0, 19)
        else delete next.at
        return next
      },
      replace: true,
      // Only the board under the chart changes: stay where you are on the page.
      resetScroll: false,
    })
    setView('board')
  }
  const wr = board.data?.[0]
  const wrRendered = useRenderedSet(wr ? [wr] : [], data.game)
  const toggleView = (v: View) => setView((cur) => (cur === v ? 'board' : v))

  return (
    <Page background={map.image} blur narrow>
      <Panel icon={PinIcon} title="Map Info" className="mx-auto max-w-[980px]" bodyClassName="p-0">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,430px)] gap-10 px-[30px] pt-7 pb-[26px] upto900:grid-cols-1 upto900:px-4 upto900:py-5">
          <div className="min-w-0">
            <h1 className="m-0 text-[64px] leading-none font-semibold uppercase upto900:text-[44px]">
              {map.title}
            </h1>
            <p className="mt-0.5 mb-3.5 text-4xl font-light uppercase upto900:text-[26px]">{map.chapter}</p>
            <WrHistoryChart points={history.data} loading={history.isPending} at={at} onPick={pickMoment} />
            <div className="flex flex-wrap gap-3">
              <Select
                value="main"
                onChange={() => {}}
                options={map.game === 'mel' ? MEL_CATEGORIES : CATEGORIES}
                label="Category"
                className="w-[218px] upto480:w-full"
              />
              <SeasonSelect base={map.game} season={season} className="w-[218px] upto480:w-full" />
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-[26px]">
            {wr ? (
              <RunVideo run={wr} game={data.game} rendered={wrRendered} title={`${map.title} world record`} />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border border-track bg-row-sub-alt text-text-dim">
                No video
              </div>
            )}
            <div className="grid grid-cols-2 gap-10 upto900:gap-3">
              {map.game === 'portal2' && (
                <a
                  href={`https://wiki.portal2.sr/${encodeURIComponent(map.title.replace(/ /g, '_'))}`}
                  target="_blank"
                  rel="noreferrer"
                  className={outlineButton}
                >
                  P2SR Wiki Article <WikiIcon />
                </a>
              )}
              <button
                type="button"
                onClick={() => toggleView('history')}
                aria-pressed={view === 'history'}
                className={outlineButton}
              >
                {view === 'history' ? 'Leaderboard' : 'Chamber History'} <HistoryIcon />
              </button>
              {isStaff(user) && (
                <button
                  type="button"
                  onClick={() => toggleView('wr')}
                  aria-pressed={view === 'wr'}
                  className={cn(outlineButton, 'border-dashed')}
                >
                  {view === 'wr' ? 'Leaderboard' : 'Edit WR history'} <TrophyFilledIcon />
                </button>
              )}
            </div>
            {env.VITE_VIEWER && (
              <ReplayActions
                map={data}
                board={board.data}
                picking={picking}
                onPicking={(on) => {
                  setPicking(on)
                  if (on) setView('board')
                }}
                buttonClassName={cn(outlineButton, 'disabled:cursor-default disabled:opacity-50')}
              />
            )}
          </div>
        </div>

        <div className="bg-[rgb(var(--panel-rgb)/0.6)] px-[30px] pt-[22px] pb-[30px] upto900:px-2.5 upto900:py-4">
          {view === 'board' ? (
            <MapLeaderboard
              map={data}
              board={board}
              at={at}
              onClearAt={() => pickMoment(null)}
              renderRunDetails={renderRunDetails}
              picking={picking}
              onRacePicked={racePicked}
              onStopPicking={() => setPicking(false)}
            />
          ) : view === 'wr' ? (
            <WrHistoryEditor map={data} />
          ) : (
            <ChamberHistory map={data} />
          )}
        </div>
      </Panel>
    </Page>
  )
}
