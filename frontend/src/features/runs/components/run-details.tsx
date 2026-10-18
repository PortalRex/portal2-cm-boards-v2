import { useQuery } from '@tanstack/react-query'
import { cn } from 'cn'
import { useState, type ReactNode } from 'react'
import { DownloadIcon, PlayIcon, VideocamIcon, YouTubeIcon } from '@/components/icons'
import { PlayerLink } from '@/components/player-link'
import { RunVideo } from '@/components/runs/run-media'
import { apiUrl } from '@/lib/api-client'
import type { FormattedSegment } from '@/lib/autorender'
import { formatDate, formatDateTime, formatScore } from '@/lib/format'
import { runVideo } from '@/lib/runs/video'
import type { CoopHalf, Player, RunMap } from '@/types/runs'
import { coopHalvesQueryOptions, segmentsQueryOptions } from '../api/details'
import { timerNote } from '../utils/timer-note'
import { PendingProof } from './pending-proof'
import { ReactionsBar } from './reactions-bar'
import { ReportRun } from './report-run'
import { StaffTools } from './staff-tools'

/**
 * The run a details panel shows: a score update, a map board row or a profile score (they share
 * these fields).
 */
export interface DetailsRun {
  id?: number
  changelogId?: number | null
  changelogIds?: (number | null)[]
  coopId?: number | null
  rolesKnown?: boolean | null
  score?: number | null
  postRank?: number | null
  rank?: number | null
  timestamp?: string | null
  dateEstimated?: boolean
  players?: Player[]
  youtubeId?: string | null
  autorenderId?: string | null
  demoId?: number | null
  note?: string | null
  portals?: number | null
  sarVersion?: string | null
  verified?: boolean
  banned?: boolean
}

const outlineButton =
  'inline-flex h-9 cursor-pointer items-center justify-center gap-2.5 rounded-[4px] border border-line-strong bg-control px-3 text-lg whitespace-nowrap hover:bg-control-raised [&_svg]:size-5'
const disabled = 'pointer-events-none opacity-45'

/**
 * Expanded view of one run: video, mtrigger segments, and run info / links. Co-op runs get a
 * switch between the two players' halves (each has its own demo, video and comment).
 */
export function RunDetails({
  run,
  map,
  game = 'portal2',
  rendered,
  showReactions = true,
  children,
}: {
  run: DetailsRun
  map: RunMap
  game?: string
  rendered?: Map<number, string>
  /** Score Updates rows have their own reaction buttons, so they leave these out. */
  showReactions?: boolean
  /** Further sections under the info (reactions, report, staff tools). */
  children?: ReactNode
}) {
  const halves = useQuery({ ...coopHalvesQueryOptions(run.coopId ?? -1), enabled: run.coopId != null })
  const [picked, setPicked] = useState<number | null>(null)
  const own = run.changelogId ?? run.id ?? null
  const list = halves.data?.length === 2 ? halves.data : null
  const index =
    picked ??
    (list
      ? Math.max(
          0,
          list.findIndex((h) => h.changelogId === own),
        )
      : 0)
  const half = list?.[index]
  // What the media and comment show: the selected player's own entry.
  const view: DetailsRun =
    half?.changelogId != null
      ? {
          ...run,
          id: half.changelogId,
          changelogId: half.changelogId,
          changelogIds: [half.changelogId],
          youtubeId: half.youtubeId,
          autorenderId: half.autorenderId,
          demoId: half.demoId,
          note: half.note,
          portals: half.portals,
          sarVersion: half.sarVersion,
          timestamp: half.timestamp ?? run.timestamp,
        }
      : run
  const ids = (view.changelogIds ?? [view.changelogId ?? view.id ?? null]).filter(
    (id): id is number => id != null,
  )
  const segments = useQuery({ ...segmentsQueryOptions(ids, map.title), enabled: ids.length > 0 })
  const video = runVideo(view, game, rendered)
  const rank = run.postRank ?? run.rank
  const youtube = view.youtubeId
    ? `https://www.youtube.com/watch?v=${view.youtubeId.split('?')[0]}`
    : undefined
  const canRender = Boolean(view.demoId) && !video.ready && Boolean(video.render)

  return (
    <div className="@container/run-details">
      <div className="grid grid-cols-[minmax(240px,345px)_minmax(0,1fr)_minmax(260px,380px)] gap-5 border-t-2 border-row bg-panel p-5 @max-[1150px]/run-details:grid-cols-[minmax(220px,320px)_minmax(0,1fr)] @max-[640px]/run-details:grid-cols-1 @max-[640px]/run-details:p-3">
        <div>
          <RunVideo
            key={view.changelogId ?? view.id}
            run={view}
            game={game}
            rendered={rendered}
            title={`${map.title} run`}
          />
          {list && <CoopToggle halves={list} index={index} onPick={setPicked} />}
        </div>

        <Segments loading={segments.isPending && ids.length > 0} data={segments.data ?? null} />

        <div className="flex min-w-0 flex-col text-lg @max-[1150px]/run-details:col-span-full">
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-[22px] gap-y-1">
            <dt className="text-text-2 uppercase">Comment:</dt>
            <dd className="m-0 text-text-2">{view.note || 'No comment'}</dd>
          </dl>
          <dl className="m-0 mt-auto grid grid-cols-[auto_1fr] gap-x-[22px] gap-y-1 pt-6 [&_dd]:m-0 [&_dd]:text-text-2 [&_dt]:text-text-2">
            {run.players && run.players.length > 0 && (
              <>
                <dt>Player{run.players.length > 1 ? 's' : ''}:</dt>
                <dd className="flex flex-wrap gap-x-3 gap-y-1">
                  {run.players.map((p, i) => (
                    <PlayerLink key={i} player={p} className="hover:underline" />
                  ))}
                </dd>
              </>
            )}
            {run.score != null && (
              <>
                <dt>Time:</dt>
                <dd className="num">
                  {formatScore(run.score)}
                  {rank != null ? ` · rank ${rank}` : ''}
                </dd>
              </>
            )}
            {view.timestamp && (
              <>
                <dt>Date:</dt>
                {view.dateEstimated ? (
                  <dd
                    className="num"
                    title="The old board had no date for this run; this is when the runs around it were added."
                  >
                    About {formatDate(view.timestamp)} <span className="text-text-muted">(estimated)</span>
                  </dd>
                ) : (
                  <dd className="num">{formatDateTime(view.timestamp)}</dd>
                )}
              </>
            )}
            <dt>SAR Version:</dt>
            <dd>{view.sarVersion || 'Unknown'}</dd>
            {view.portals != null && (
              <>
                <dt>Portals:</dt>
                <dd className="num">{view.portals}</dd>
              </>
            )}
            <dt>Status:</dt>
            <dd>{run.banned ? 'Banned' : run.verified === false ? 'Pending' : 'Verified'}</dd>
          </dl>
          <TimerNote score={run.score} segments={segments.data ?? null} />
          {own != null && <PendingProof run={{ ...run, changelogId: own }} />}
          {own != null && showReactions && <ReactionsBar changelogId={own} />}
          {own != null && <ReportRun changelogId={own} />}
          {own != null && <StaffTools run={{ ...run, changelogId: own }} map={map} game={game} />}
          {children}
          <div className="mt-3.5 grid grid-cols-2 gap-[18px] @max-[640px]/run-details:grid-cols-1">
            {view.demoId ? (
              <a
                href={apiUrl(`/demos/${view.demoId}/file`)}
                download
                title="Download the demo"
                className={outlineButton}
              >
                Download Demo <DownloadIcon />
              </a>
            ) : (
              <button
                type="button"
                disabled
                title="No demo for this run"
                className={cn(outlineButton, 'cursor-default opacity-50')}
              >
                Download Demo <DownloadIcon />
              </button>
            )}
            <a
              href={youtube}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!youtube}
              className={cn(outlineButton, !youtube && disabled)}
            >
              YouTube <YouTubeIcon />
            </a>
            {video.ready ? (
              <a
                href={video.page}
                target="_blank"
                rel="noreferrer"
                className={cn(outlineButton, 'col-span-full')}
              >
                Autorender <PlayIcon />
              </a>
            ) : (
              <a
                href={canRender ? video.render! : undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!canRender}
                className={cn(outlineButton, 'col-span-full', !canRender && disabled)}
              >
                Request render <VideocamIcon />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Segments({ loading, data }: { loading: boolean; data: FormattedSegment[] | null }) {
  if (loading) return <div className="p-6 text-text-muted">Loading segments…</div>
  if (!data?.length) {
    return (
      <div className="p-6 text-text-muted">
        No mtrigger data for this run. Segments are read from the demo when autorender renders it, and only
        demos recorded with SAR mtriggers have them.
      </div>
    )
  }
  const cell = 'h-[30px] text-center first:pl-6 first:text-left @max-[640px]/run-details:first:pl-2'
  return (
    <table className="w-full border-collapse text-lg @max-[640px]/run-details:text-sm">
      <thead>
        <tr className="[&>th]:font-normal [&>th]:text-text-muted [&>th]:uppercase">
          {['Segment', 'Seconds', 'Ticks', 'Total', 'Total ticks'].map((h) => (
            <th key={h} className={cell}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((s, i) => (
          <tr
            key={i}
            className="text-text-2 odd:bg-row-sub even:bg-row-sub-alt"
            title={s.splits.length ? s.splits.map((sp) => `${sp.name}: ${sp.ticks}`).join('\n') : undefined}
          >
            <td className={cell}>{s.name}</td>
            <td className={cn(cell, 'num')}>{s.seconds.toFixed(3)}</td>
            <td className={cn(cell, 'num')}>{s.ticks}</td>
            <td className={cn(cell, 'num')}>{s.total.toFixed(3)}</td>
            <td className={cn(cell, 'num')}>{s.totalTicks}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TimerNote({
  score,
  segments,
}: {
  score: number | null | undefined
  segments: FormattedSegment[] | null
}) {
  const note = timerNote(score, segments?.length ? segments[segments.length - 1]!.totalTicks : null)
  if (!note) return null
  return (
    <p
      className="mt-2 mb-0 rounded-[4px] bg-[rgb(59_155_255/0.12)] px-2.5 py-1.5 text-sm text-text-2"
      title="Some setups (Linux among them) turn ticks into a time slightly differently."
    >
      Timer rounding: the demo’s {note.ticks} ticks are {formatScore(note.demo)}; the game showed{' '}
      {formatScore(score)}.
    </p>
  )
}

/** Switches the panel between the two players' halves of a co-op run (blue first when known). */
function CoopToggle({
  halves,
  index,
  onPick,
}: {
  halves: CoopHalf[]
  index: number
  onPick: (i: number) => void
}) {
  const rolesKnown = halves[0]!.isHost != null
  return (
    <div className="mt-2.5 flex gap-1.5" role="tablist" aria-label="Player">
      {halves.map((h, i) => {
        const active = i === index
        const tone = !rolesKnown
          ? 'data-[active]:border-text-muted data-[active]:bg-portal-neutral'
          : i === 0
            ? 'data-[active]:border-[rgb(40,140,255)] data-[active]:bg-portal-blue'
            : 'data-[active]:border-[rgb(255,140,30)] data-[active]:bg-portal-orange'
        return (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active || undefined}
            disabled={h.changelogId == null}
            title={
              h.changelogId == null
                ? `${h.player?.name || 'Partner'} has no run of their own recorded`
                : `Show ${h.player?.name || 'this player'}'s demo, video and comment`
            }
            onClick={() => onPick(i)}
            className={cn(
              'h-[34px] min-w-0 flex-1 cursor-pointer truncate rounded-[4px] border border-line bg-control px-2.5 text-[15px] text-text-2 disabled:cursor-default disabled:opacity-45 data-[active]:text-foreground',
              tone,
            )}
          >
            {h.player?.name || 'Unknown partner'}
          </button>
        )
      })}
    </div>
  )
}
