import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { useState } from 'react'
import { AppLink } from '@/components/app-link'
import { PlayerLink } from '@/components/player-link'
import { Segmented } from '@/components/segmented'
import { EmptyState, Loading } from '@/components/status'
import { findMap, mapPath, useCatalog } from '@/lib/catalog'
import { formatDate, formatScore, timeAgo } from '@/lib/format'
import { invalidateRun } from '@/lib/invalidate'
import { queryKeys } from '@/lib/query-keys'
import {
  acceptHeldDemo,
  dismissHeldDemo,
  heldDemoFileUrl,
  heldDemosQueryOptions,
  recheckHeldDemo,
  type HeldDemo,
  type HeldFilter,
} from '../api/held-demos'

const STATUSES: { value: HeldFilter; label: string }[] = [
  { value: 'pending', label: 'Waiting' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'all', label: 'All' },
]
const SOURCES: Record<HeldDemo['source'], string> = {
  autosubmit: 'SAR auto-submit',
  submit: 'Submit Run',
}
const action =
  'h-8 cursor-pointer rounded-[4px] border border-line-strong bg-control px-3.5 text-[15px] text-foreground disabled:cursor-default disabled:opacity-50'

/** The time accepting a held demo records: the demo's own, else the one SAR sent. */
const heldTime = (d: HeldDemo) => d.parsed?.timeScore ?? d.claimed_score

/** Why a held demo can't be accepted as it is (it's entered by hand in Submit Run instead). */
function cannotAccept(d: HeldDemo): string | null {
  if (!d.map_id && !d.parsed?.mapName) return 'The demo’s map isn’t known'
  if (heldTime(d) == null) return 'The demo has no time'
  return null
}

/**
 * Staff: demos refused at submission for a reason that may be the parser's or the game's (it
 * couldn't read the demo, found no finished run, or read another time than SAR sent), kept
 * instead of deleted. Accept one to record its run, or dismiss it.
 */
export function HeldDemos() {
  const [status, setStatus] = useState<HeldFilter>('pending')
  const held = useInfiniteQuery(heldDemosQueryOptions(status))
  const list = held.data?.pages.flat() ?? []
  const loading = held.isPending || held.isFetchingNextPage
  return (
    <div className="flex flex-col gap-3">
      <Segmented
        className="self-start"
        label="Held demos"
        value={status}
        onChange={setStatus}
        options={STATUSES}
        itemClassName="upto480:flex-auto upto480:px-2 upto480:text-lg"
      />
      <p className="m-0 text-sm text-text-muted">
        Demos the boards refused when the cause may be the demo parser or the game, not the player. Accepting
        one records its run as the submission would have been. One the boards can’t time or place: download it
        and enter the run by hand in Submit Run, then dismiss it.
      </p>
      {held.isError && <EmptyState>Couldn’t load held demos: {held.error.message}</EmptyState>}
      {!held.isError && !loading && !list.length && (
        <EmptyState>{status === 'pending' ? 'No demos waiting.' : 'No held demos.'}</EmptyState>
      )}
      {list.map((d) => (
        <HeldDemoCard key={d.id} demo={d} />
      ))}
      {loading && <Loading />}
      {!loading && held.hasNextPage && list.length > 0 && (
        <button
          type="button"
          className="mt-4 inline-flex h-10 cursor-pointer items-center justify-center rounded-[4px] border border-line-strong bg-control px-5 text-lg whitespace-nowrap hover:bg-control-raised"
          onClick={() => void held.fetchNextPage()}
        >
          Load more
        </button>
      )}
    </div>
  )
}

/** What the parser reads in the demo. */
function ParsedLine({ demo: d }: { demo: HeldDemo }) {
  const p = d.parsed
  if (!p) return <span>The demo parser couldn’t read this demo.</span>
  const players = p.players.map((pl) => pl.name || pl.steamId).join(' & ')
  return (
    <span>
      The demo: <span className="font-mono text-[14px]">{p.mapName ?? 'unknown map'}</span>
      {' · '}
      {p.timeScore != null ? (
        <>
          <span className="num">{formatScore(p.timeScore)}</span>
          {p.timeSource === 'sar' && <span className="text-text-muted"> (SAR’s timer, no scoreboard)</span>}
        </>
      ) : (
        'no finished run'
      )}
      {players && <> · {players}</>}
    </span>
  )
}

function HeldDemoCard({ demo: d }: { demo: HeldDemo }) {
  const qc = useQueryClient()
  const catalog = useCatalog()
  const [note, setNote] = useState('')
  const map = d.map_id ? findMap(catalog, d.map_id) : undefined
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['admin', 'held-demos'] }),
      qc.invalidateQueries({ queryKey: queryKeys.admin.inbox() }),
      qc.invalidateQueries({ queryKey: ['admin', 'audit'] }),
    ])
  const recheck = useMutation({ mutationFn: () => recheckHeldDemo(d.id), onSuccess: refresh })
  const accept = useMutation({
    mutationFn: () => acceptHeldDemo(d.id, note.trim()),
    onSuccess: (run) =>
      Promise.all([
        refresh(),
        invalidateRun(qc, { changelogId: run.changelog_id, profileNumbers: [d.profile_number, run.partner] }),
      ]),
  })
  const dismiss = useMutation({ mutationFn: () => dismissHeldDemo(d.id, note.trim()), onSuccess: refresh })
  const busy = recheck.isPending || accept.isPending || dismiss.isPending
  const error = recheck.error ?? accept.error ?? dismiss.error
  const pending = d.status === 'pending'
  const time = heldTime(d)
  const blocked = cannotAccept(d)
  const sarTimeDiffers =
    d.claimed_score != null && d.parsed?.timeScore != null && d.parsed.timeScore !== d.claimed_score
  return (
    <article
      className={cn(
        'flex flex-col gap-2.5 rounded-md border border-line bg-row-alt px-4 py-3.5',
        !pending && 'border-dashed',
      )}
    >
      <header className="flex flex-wrap items-center gap-2.5">
        <span className="rounded-[4px] bg-seg-active px-2.5 py-0.5 text-sm font-semibold">
          {SOURCES[d.source]}
        </span>
        <span className="ml-auto text-sm text-text-muted" title={formatDate(`${d.created_at}Z`)}>
          {timeAgo(`${d.created_at}Z`)}
        </span>
      </header>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-base">
        <span className="min-w-0">
          {map ? (
            <AppLink href={mapPath(map)} className="text-brand-light">
              {d.map_name ?? map.title}
            </AppLink>
          ) : (
            (d.map_name ?? <span className="text-text-muted">Unknown map</span>)
          )}
        </span>
        <PlayerLink player={{ profileNumber: d.profile_number, name: d.user_name }} />
        {d.claimed_score != null && (
          <span className="text-text-2">
            SAR sent <span className="num">{formatScore(d.claimed_score)}</span>
          </span>
        )}
      </div>
      <p className="m-0 border-l-[3px] border-line-strong bg-row px-3 py-2 text-[15px] wrap-anywhere">
        {d.reason}
      </p>
      <p className="m-0 text-[15px] text-text-2 wrap-anywhere">
        <ParsedLine demo={d} />
        {sarTimeDiffers && <span className="text-hl-red-text"> · not the time SAR sent</span>}
      </p>
      {(d.note || d.youtube_id) && (
        <p className="m-0 text-[15px] wrap-anywhere whitespace-pre-wrap">
          {d.note}
          {d.youtube_id && (
            <>
              {d.note && ' · '}
              <a
                href={`https://www.youtube.com/watch?v=${d.youtube_id.split('?')[0]}`}
                target="_blank"
                rel="noreferrer"
                className="text-brand-light"
              >
                Video
              </a>
            </>
          )}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {pending ? (
          <>
            <a href={heldDemoFileUrl(d.id)} className="mr-auto text-[15px] text-brand-light">
              Download demo ({(d.file_size / (1024 * 1024)).toFixed(1)} MB)
            </a>
            <input
              className="h-8 min-w-[200px] flex-1 rounded-[4px] border border-line bg-control px-2.5 text-[15px] text-foreground"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (audit log)"
              aria-label="Note"
              maxLength={500}
            />
            <button
              type="button"
              className={action}
              disabled={busy}
              onClick={() => recheck.mutate()}
              title="Have the demo parser read it again (after a parser fix)"
            >
              {recheck.isPending ? 'Reading…' : 'Re-check'}
            </button>
            <button type="button" className={action} disabled={busy} onClick={() => dismiss.mutate()}>
              Dismiss
            </button>
            <button
              type="button"
              className={cn(action, 'border-brand bg-brand font-semibold text-white')}
              disabled={busy || blocked != null}
              title={blocked ?? undefined}
              onClick={() => accept.mutate()}
            >
              {time != null && !blocked ? `Accept ${formatScore(time)}` : 'Accept'}
            </button>
          </>
        ) : (
          <span className="text-text-muted">
            {d.status === 'accepted' ? 'Accepted' : 'Dismissed'}
            {d.reviewed_by_name ? ` by ${d.reviewed_by_name}` : ''}
            {d.reviewed_at ? ` ${timeAgo(`${d.reviewed_at}Z`)}` : ''}
            {d.review_note ? ` · “${d.review_note}”` : ''}
            {d.changelog_id != null && (
              <>
                {' · '}
                <Link
                  to="/run/$runId"
                  params={{ runId: String(d.changelog_id) }}
                  className="text-brand-light"
                >
                  Open the run
                </Link>
              </>
            )}
          </span>
        )}
      </div>
      {pending && blocked && (
        <p className="m-0 text-right text-sm text-text-muted">
          {blocked}: download it and enter the run by hand in Submit Run.
        </p>
      )}
      {error && <p className="m-0 text-sm text-hl-red-text">{error.message}</p>}
    </article>
  )
}
