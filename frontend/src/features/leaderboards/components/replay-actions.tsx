import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { cn } from 'cn'
import { useState } from 'react'
import { useCatalog, type MapInfo } from '@/lib/catalog'
import { queryKeys } from '@/lib/query-keys'
import { replaySearch, type ReplayRuns, type ReplayWhat } from '@/lib/runs/viewer'
import type { RankedRun } from '@/types/runs'
import { getWrDemos } from '../api/map-board'
import { swarmReplay, topReplay, wrReplay } from '../utils/replay'

const TOP = 5
const SWARM = 100
// World records raced at most (newest first): an old map's whole history is many demos to download.
const WR_RACED = 40

/**
 * The map's runs in the replay page: the top runs raced, the WR history raced, the top 100 as a
 * swarm, or runs picked on the board (`picking` turns picking on there). Where the demo viewer is
 * built in.
 */
export function ReplayActions({
  map,
  board,
  picking,
  onPicking,
  buttonClassName,
}: {
  map: MapInfo
  board: readonly RankedRun[] | undefined
  picking: boolean
  onPicking: (on: boolean) => void
  buttonClassName: string
}) {
  const catalog = useCatalog()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [wrState, setWrState] = useState<'idle' | 'loading' | 'none' | 'error'>('idle')
  const open = (runs: ReplayRuns | null, what: ReplayWhat) => {
    if (runs) void navigate({ to: '/replay', search: replaySearch(runs, { map: map.id, what }) })
  }
  const raceWrs = async () => {
    setWrState('loading')
    try {
      const demos = await queryClient.fetchQuery({
        queryKey: queryKeys.wrDemos(map.game, map.id),
        queryFn: ({ signal }) => getWrDemos(map, catalog, signal),
      })
      const runs = wrReplay(demos, WR_RACED)
      setWrState(runs ? 'idle' : 'none')
      open(runs, 'wr')
    } catch {
      setWrState('error')
    }
  }
  const top = board ? topReplay(board, TOP) : null

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 upto900:gap-2">
        <button
          type="button"
          disabled={!top}
          onClick={() => open(top, 'top')}
          title="Race the board's top 5 runs against each other in the replay"
          className={buttonClassName}
        >
          Race Top {TOP}
        </button>
        <button
          type="button"
          disabled={wrState === 'loading'}
          onClick={() => void raceWrs()}
          title="Race the map's world records (those with demos) against each other in the replay"
          className={buttonClassName}
        >
          {wrState === 'loading' ? 'Loading…' : 'Race WR History'}
        </button>
        <button
          type="button"
          disabled={!top}
          onClick={() => open(board ? swarmReplay(board, SWARM) : null, 'swarm')}
          title="The board's top 100 runs as a swarm of dots moving through the map with the best"
          className={buttonClassName}
        >
          Swarm Top {SWARM}
        </button>
        <button
          type="button"
          aria-pressed={picking}
          disabled={!top}
          onClick={() => onPicking(!picking)}
          title="Tick runs on the board, then race them in the replay"
          className={cn(buttonClassName, picking && 'border-brand')}
        >
          {picking ? 'Stop Picking' : 'Pick Runs to Race'}
        </button>
      </div>
      {wrState === 'none' && <p className="m-0 text-text-muted">No world record here has a demo.</p>}
      {wrState === 'error' && <p className="m-0 text-text-muted">Couldn’t load the world records.</p>}
    </div>
  )
}
