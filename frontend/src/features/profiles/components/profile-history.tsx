import { cn } from 'cn'
import { TriangleRight } from '@/components/icons'
import { RankNumber } from '@/components/rank'
import { AutorenderLink, DemoLink, ViewerLink, YouTubeLink } from '@/components/runs/run-media'
import { TimeButton } from '@/components/runs/time-button'
import { EmptyState } from '@/components/status'
import { useRenderedSet } from '@/hooks/use-rendered-set'
import type { MapInfo } from '@/lib/catalog'
import { formatDateTime, formatDelta, timeAgo } from '@/lib/format'
import { rankTileVars } from '@/lib/ranks'
import type { Run } from '@/types/runs'
import { rankClass } from '../utils/tables'
import { SectionTitle } from './score-tables'

const row =
  'grid min-h-[33px] grid-cols-[60px_30px_60px_minmax(0,1fr)_90px_60px_76px] items-center gap-x-2 text-lg upto800:grid-cols-[44px_18px_44px_minmax(0,1fr)_76px]'
const desktopOnly = 'upto800:hidden'

/** The player's latest ten runs (on the opened map, when a run is open). */
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
  const rows = (onMap ? history.filter((h) => h.map.id === map.id) : history).slice(0, 10)
  const rendered = useRenderedSet(rows, game)
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
      {rows.length ? (
        rows.map((h) => (
          <div key={h.id} className={row}>
            <span
              className={cn(
                'num flex h-7 items-center justify-center rounded-[3px] bg-hl-green-2',
                rankClass(h.preRank, true),
              )}
              style={rankTileVars(h.preRank)}
            >
              <RankNumber rank={h.preRank} inherit />
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
              {map ? timeAgo(h.timestamp) : `${h.map.title} · ${timeAgo(h.timestamp)}`}
            </span>
            <span className="num text-right">
              <TimeButton score={h.score} players={h.players} map={h.map} />
            </span>
            <span className={cn('num text-right', desktopOnly)}>
              {h.scoreDelta != null ? formatDelta(h.scoreDelta) : ''}
            </span>
            <span className={cn('flex justify-end gap-1 [&_svg]:block', desktopOnly)}>
              <AutorenderLink run={h} game={game} rendered={rendered} size={22} />
              {h.youtubeId && <YouTubeLink id={h.youtubeId} size={22} />}
              <DemoLink demoId={h.demoId} hideMissing />
              <ViewerLink demoIds={[h.demoId]} runId={h.id} mapId={h.map.id} />
            </span>
          </div>
        ))
      ) : (
        <EmptyState>{map ? `No submissions for ${map.title}.` : 'No submissions yet.'}</EmptyState>
      )}
    </section>
  )
}
