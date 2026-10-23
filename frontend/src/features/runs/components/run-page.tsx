import { useQuery } from '@tanstack/react-query'
import { AppLink } from '@/components/app-link'
import { TimerIcon } from '@/components/icons'
import { siteBackground } from '@/components/layouts/backgrounds'
import { Page } from '@/components/layouts/page'
import { Panel } from '@/components/panel'
import { EmptyState, ErrorState, Loading } from '@/components/status'
import { mapPath, useCatalog } from '@/lib/catalog'
import { isMissingRun, runQueryOptions } from '../api/run'
import { RunDetails } from './run-details'

/**
 * One run on its own page (`/run/{id}`): its map, linking to the map's board, and the usual run
 * details. Where a player's activity and full history link to.
 */
export function RunPage({ runId }: { runId: number }) {
  const catalog = useCatalog()
  const run = useQuery(runQueryOptions(runId, catalog))

  return (
    <Page background={siteBackground} tint="mono">
      <Panel icon={TimerIcon} title="Run" bodyClassName="p-0">
        {run.isPending ? (
          <Loading />
        ) : isMissingRun(run.error) ? (
          <EmptyState>No such run. It may have been deleted.</EmptyState>
        ) : run.isError ? (
          <ErrorState error={run.error} onRetry={() => void run.refetch()} />
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pt-4 pb-3">
              <h1 className="m-0 text-[28px] font-semibold">
                <AppLink href={mapPath(run.data.map)} className="hover:underline">
                  {run.data.map.title}
                </AppLink>
              </h1>
              {run.data.map.chapter && (
                <span className="text-base text-text-muted">{run.data.map.chapter}</span>
              )}
            </div>
            <RunDetails run={run.data} map={run.data.map} game={run.data.game} />
          </>
        )}
      </Panel>
    </Page>
  )
}
