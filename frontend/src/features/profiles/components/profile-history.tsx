import { cn } from 'cn'
import { useMemo, useState, type ReactNode } from 'react'
import { TriangleRight } from '@/components/icons'
import { RankNumber } from '@/components/rank'
import { AutorenderLink, DemoLink, YouTubeLink } from '@/components/runs/run-media'
import { TimeButton } from '@/components/runs/time-button'
import { EmptyState } from '@/components/status'
import { useRenderedSet } from '@/hooks/use-rendered-set'
import type { MapInfo } from '@/lib/catalog'
import { formatDateTime, formatDelta, timeAgo } from '@/lib/format'
import { ageColor } from '@/lib/age-color'
import { rankTileVars } from '@/lib/ranks'
import { groupStreaks, streakSummary } from '@/lib/runs/group-streaks'
import type { Run } from '@/types/runs'
import { rankClass } from '../utils/tables'
import { SectionTitle } from './score-tables'

const row =
  'grid min-h-[33px] grid-cols-[60px_30px_60px_minmax(0,1fr)_90px_60px_76px] items-center gap-x-2 text-lg upto800:grid-cols-[44px_18px_44px_minmax(0,1fr)_76px]'
const desktopOnly = 'upto800:hidden'

/**
 * The player's latest ten sessions (on the opened map, when a run is open): a run of PBs on one
 * map close together is one row, as in Score Updates, from the rank before its first PB to the
 * last one's, with the time they took off together; its earlier PBs open under it.
 */
export function ProfileHistory({
  history,
  game,
  map,
}: {
  history: Run[]
  game: string
  map: MapInfo | null
}) {
  const onMap = map && map.game === game
  const sessions = useMemo(
    () => groupStreaks(onMap ? history.filter((h) => h.map.id === map.id) : history).slice(0, 10),
    [history, onMap, map],
  )
  const rendered = useRenderedSet(
    sessions.flatMap((s) => [s, ...s.earlier]),
    game,
  )
  const [openId, setOpenId] = useState<number | null>(null)
  return (
    <section>
      <SectionTitle className="mt-0">History{map ? ` · ${map.title}` : ''}</SectionTitle>
      <div className={cn(row, 'text-[15px] font-light whitespace-nowrap text-text-2 uppercase')}>
        <span>
          Old<span className={desktopOnly}> rank</span>
        </span>
        <span />
        <span>
          New<span className={desktopOnly}> rank</span>
        </span>
        <span>{map ? 'Time ago' : 'Map'}</span>
        <span className="text-right">New time</span>
        <span className={cn('text-right', desktopOnly)}>ΔOld</span>
        <span className={desktopOnly} />
      </div>
      {sessions.length ? (
        sessions.map((s) => {
          const open = openId === s.id
          const { preRank, scoreDelta } = s.earlier.length ? streakSummary(s) : s
          return (
            <div key={s.id}>
              <HistoryRow
                run={s}
                preRank={preRank}
                scoreDelta={scoreDelta}
                showMap={!map}
                game={game}
                rendered={rendered}
                earlier={
                  s.earlier.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : s.id)}
                      aria-expanded={open}
                      className="block w-full border-0 bg-transparent p-0 text-right text-[13px] leading-tight font-normal text-text-muted hover:text-foreground"
                    >
                      +{s.earlier.length} earlier PB{s.earlier.length === 1 ? '' : 's'}
                    </button>
                  )
                }
              />
              {open && (
                <ol className="m-0 list-none p-0 opacity-75" aria-label="Earlier PBs this session">
                  {s.earlier.map((e) => (
                    <li key={e.id}>
                      <HistoryRow
                        run={e}
                        preRank={e.preRank}
                        scoreDelta={e.scoreDelta}
                        showMap={!map}
                        game={game}
                        rendered={rendered}
                      />
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )
        })
      ) : (
        <EmptyState>{map ? `No submissions for ${map.title}.` : 'No submissions yet.'}</EmptyState>
      )}
    </section>
  )
}

function HistoryRow({
  run: h,
  preRank,
  scoreDelta,
  showMap,
  game,
  rendered,
  earlier,
}: {
  run: Run
  preRank: number | null
  scoreDelta: number | null
  showMap: boolean
  game: string
  rendered: Map<number, string>
  /** A session's "+N earlier PBs", under its time. */
  earlier?: ReactNode
}) {
  return (
    <div className={row}>
      <span
        className={cn(
          'num flex h-7 items-center justify-center rounded-[3px] bg-hl-green-2',
          rankClass(preRank, true),
        )}
        style={rankTileVars(preRank)}
      >
        <RankNumber rank={preRank} inherit />
      </span>
      <TriangleRight size={14} className="justify-self-center" />
      <span
        className={cn(
          'num flex h-7 items-center justify-center rounded-[3px] bg-hl-teal',
          rankClass(h.postRank, true),
        )}
        style={rankTileVars(h.postRank)}
      >
        <RankNumber rank={h.postRank} inherit />
      </span>
      <span
        className="truncate font-light whitespace-nowrap text-text-muted"
        title={formatDateTime(h.timestamp)}
      >
        {showMap && `${h.map.title} · `}
        <span style={{ color: ageColor(h.timestamp) }}>{timeAgo(h.timestamp)}</span>
      </span>
      <span className="num text-right">
        <TimeButton score={h.score} players={h.players} map={h.map} />
        {earlier}
      </span>
      <span className={cn('num text-right', desktopOnly)}>
        {scoreDelta != null ? formatDelta(scoreDelta) : ''}
      </span>
      <span className={cn('flex justify-end gap-1 [&_svg]:block', desktopOnly)}>
        <AutorenderLink run={h} game={game} rendered={rendered} size={22} />
        {h.youtubeId && <YouTubeLink id={h.youtubeId} size={22} />}
        <DemoLink demoId={h.demoId} hideMissing />
      </span>
    </div>
  )
}
