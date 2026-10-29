import { useQuery } from '@tanstack/react-query'
import { AppLink } from '@/components/app-link'
import { ViewerIcon } from '@/components/icons'
import { siteBackground } from '@/components/layouts/backgrounds'
import { Page } from '@/components/layouts/page'
import { Panel } from '@/components/panel'
import { PlayerLink } from '@/components/player-link'
import { ReplayFrame } from '@/components/runs/replay-frame'
import { EmptyState } from '@/components/status'
import { env } from '@/config/env'
import { findMap, mapPath, useCatalog } from '@/lib/catalog'
import { formatScore } from '@/lib/format'
import { replayRunsOf, type ReplayRuns, type ReplaySearch } from '@/lib/runs/viewer'
import type { Run } from '@/types/runs'
import { runQueryOptions } from '../api/run'

/**
 * Runs replayed from their demos in the site (`/replay`): the demo viewer, full size, under a bar
 * naming the map and the run (its players, time and rank, linking to its details) or what's raced.
 */
export function ReplayPage({ search, viewer = env.VITE_VIEWER }: { search: ReplaySearch; viewer?: boolean }) {
  const catalog = useCatalog()
  const runs = replayRunsOf(search)
  const run = useQuery({ ...runQueryOptions(search.run ?? 0, catalog), enabled: search.run != null })
  const map = run.data?.map ?? (search.map ? findMap(catalog, search.map) : undefined)

  return (
    <Page background={map?.image ?? siteBackground} blur={Boolean(map?.image)} tint="mono">
      <Panel icon={ViewerIcon} title="Replay" bodyClassName="p-0">
        {!viewer ? (
          <EmptyState>Replays aren’t available on this site.</EmptyState>
        ) : !runs ? (
          <EmptyState>No run to replay.</EmptyState>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 px-5 pt-4 pb-3">
              {map && (
                <h1 className="m-0 text-[28px] font-semibold">
                  <AppLink href={mapPath(map)} className="hover:underline">
                    {map.title}
                  </AppLink>
                </h1>
              )}
              <ReplayAbout runs={runs} what={search.what} run={run.data} />
            </div>
            <ReplayFrame
              runs={runs}
              embed="full"
              title={map ? `${map.title} replay` : 'Replay'}
              className="h-[calc(100dvh-210px)] min-h-[460px] rounded-none border-x-0 border-b-0"
            />
          </>
        )}
      </Panel>
    </Page>
  )
}

/** What's replayed: the run (its players, time, rank) or the board's runs raced. */
function ReplayAbout({ runs, what, run }: { runs: ReplayRuns; what?: ReplaySearch['what']; run?: Run }) {
  const raced = 1 + (runs.race?.length ?? 0)
  const text =
    what === 'top'
      ? `The top ${raced} raced`
      : what === 'wr'
        ? `World record history: ${raced} records raced`
        : what === 'swarm'
          ? `The top ${runs.swarm?.length ?? 0} as a swarm`
          : what === 'picked'
            ? `${raced} picked runs raced`
            : null
  if (text) return <span className="text-lg text-text-2">{text}</span>
  if (!run) return null
  const rank = run.postRank
  return (
    <span className="flex flex-wrap items-baseline gap-x-3 text-lg text-text-2">
      {run.players.map((p, i) => (
        <PlayerLink key={i} player={p} className="hover:underline" />
      ))}
      <span className="num">
        {formatScore(run.score)}
        {rank != null ? ` · rank ${rank}` : ''}
      </span>
      <AppLink href={`/run/${run.id}`} className="text-base text-brand hover:underline">
        Run details
      </AppLink>
    </span>
  )
}
