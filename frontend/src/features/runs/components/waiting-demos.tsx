import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from 'cn'
import { AppLink } from '@/components/app-link'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useReadOnly } from '@/hooks/use-read-only'
import { findMap, mapPath, useCatalog } from '@/lib/catalog'
import { formatDateTime, formatScore } from '@/lib/format'
import { invalidateRun } from '@/lib/invalidate'
import { addRunDemo } from '../api/submissions'
import { waitingDemosQueryOptions, type WaitingDemo } from '../api/waiting-demos'
import { DemoButton } from './pending-proof'

/**
 * The signed-in player's pending runs that need their demo, each with its upload. A top-200 co-op
 * run needs both players' demos even when only one improved, and SAR only sends the demo of a run
 * that was your own personal best, so this is where a partner finds out. Shown on your own profile
 * (`profileNumber`) and in Submit Run (no `profileNumber`); not while the boards are read-only.
 */
export function WaitingDemos({ profileNumber, className }: { profileNumber?: string; className?: string }) {
  const user = useCurrentUser()
  const { blocked } = useReadOnly()
  const show = Boolean(
    user && !user.sample && !blocked && (!profileNumber || profileNumber === user.profileNumber),
  )
  const waiting = useQuery({ ...waitingDemosQueryOptions(), enabled: show })
  const runs = waiting.data ?? []
  if (!show || runs.length === 0) return null
  return (
    <section
      aria-label="Runs waiting for your demo"
      className={cn('rounded-md bg-pending px-3.5 py-3 text-base text-pending-text', className)}
    >
      <h2 className="m-0 text-base font-semibold">
        {runs.length === 1 ? 'A run is' : `${runs.length} runs are`} waiting for your demo
      </h2>
      <p className="mt-1 mb-2.5 text-sm">
        Co-op runs in the top 200 need both players’ demos, even when only one of you got a personal best, and
        SAR only sends yours when it was your best. Look in your Portal 2 demos folder for the demo saved when
        the run was set. <code>sar_challenge_autostop 2</code> puts the time in each challenge mode demo’s
        name.
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {runs.map((r) => (
          <WaitingRun key={r.changelog_id} run={r} />
        ))}
      </ul>
    </section>
  )
}

function WaitingRun({ run }: { run: WaitingDemo }) {
  const catalog = useCatalog()
  const qc = useQueryClient()
  const map = findMap(catalog, run.map_id)
  const upload = useMutation({
    mutationFn: (file: File) => addRunDemo(run.changelog_id, file),
    onSuccess: () => invalidateRun(qc, { changelogId: run.changelog_id, profileNumbers: [run.partner] }),
  })
  return (
    <li className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
      <span className="min-w-0 grow">
        {map ? (
          <AppLink href={mapPath(map)} className="font-semibold hover:underline">
            {run.map_name}
          </AppLink>
        ) : (
          <span className="font-semibold">{run.map_name}</span>
        )}{' '}
        <span className="num">{formatScore(run.score)}</span>
        {run.partner_name && <> with {run.partner_name}</>}
        <span className="block text-sm">Set {formatDateTime(run.timestamp)}</span>
      </span>
      {upload.isSuccess ? (
        <span className="text-sm">Demo added.</span>
      ) : (
        <DemoButton upload={upload} label="Add demo" />
      )}
      {upload.error && <span className="basis-full text-sm text-banned-text">{upload.error.message}</span>}
    </li>
  )
}
