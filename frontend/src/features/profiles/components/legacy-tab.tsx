import { cn } from 'cn'
import { useState } from 'react'
import { AppLink } from '@/components/app-link'
import { RankNumber } from '@/components/rank'
import { AutorenderLink, CommentButton, DemoLink, YouTubeLink } from '@/components/runs/run-media'
import { useRenderedSet } from '@/hooks/use-rendered-set'
import { chaptersFor, mapPath, modeLabel, PORTAL2, useCatalog } from '@/lib/catalog'
import { formatDate, formatDateTime, formatScore } from '@/lib/format'
import { rankTileVars } from '@/lib/ranks'
import type { MapScore, ProfilePlayer, RenderRunDetails } from '../types'
import { rankClass } from '../utils/tables'
import { SectionTitle } from './score-tables'

/**
 * Compact single-page view in the style of the original board's profile: every Portal 2 map with
 * rank, time and date, single player and co-op side by side. A map's name goes to its board; the
 * rest of its row opens the run; the icons (comment, autorender, video, demo) work as in the score
 * tables.
 */
export function LegacyTab({
  scores,
  player,
  renderRunDetails,
}: {
  scores: Record<string, MapScore>
  player: ProfilePlayer
  renderRunDetails?: RenderRunDetails
}) {
  const catalog = useCatalog()
  const [openId, setOpenId] = useState<string | null>(null)
  const rendered = useRenderedSet(Object.values(scores), PORTAL2)
  return (
    <div className="grid grid-cols-2 gap-[30px] upto900:grid-cols-1">
      {['sp', 'coop'].map((mode) => (
        <section key={mode} className="min-w-0">
          <SectionTitle>{modeLabel(catalog, mode)}</SectionTitle>
          {chaptersFor(catalog, mode).map((chapter) => (
            <div key={chapter.dbId ?? `${chapter.mode}-${chapter.name}`} className="mb-3.5">
              <h3 className="m-0 mb-1 text-[15px] font-medium text-text-muted uppercase">{chapter.name}</h3>
              {chapter.maps.map((m, i) => {
                const s = scores[m.id]
                const open = Boolean(s) && openId === m.id
                const toggle = () => setOpenId(open ? null : m.id)
                return (
                  <div key={m.id}>
                    <div
                      className={cn(
                        'grid h-[26px] grid-cols-[38px_minmax(0,1fr)_72px_92px_auto] items-center gap-2.5 text-[15px] upto480:grid-cols-[38px_minmax(0,1fr)_72px_92px]',
                        i % 2 === 1 && 'bg-row',
                        s?.rank === 1 && 'bg-wr-row',
                        s && 'cursor-pointer hover:bg-control-raised',
                        open && 'bg-control-raised',
                      )}
                      onClick={s ? toggle : undefined}
                      role={s ? 'button' : undefined}
                      tabIndex={s ? 0 : undefined}
                      aria-expanded={s ? open : undefined}
                      onKeyDown={
                        s
                          ? (e) => {
                              if (e.key !== 'Enter' && e.key !== ' ') return
                              e.preventDefault()
                              toggle()
                            }
                          : undefined
                      }
                    >
                      <span
                        className={cn(
                          'num flex items-center justify-center self-stretch font-medium text-white',
                          rankClass(s?.rank),
                          // Legacy's rank tint came later than this cell's 500 and set 600.
                          rankClass(s?.rank) === 'rank-tile' && 'font-semibold',
                        )}
                        style={rankTileVars(s?.rank)}
                      >
                        <RankNumber rank={s?.rank} inherit />
                      </span>
                      <AppLink
                        href={mapPath(m)}
                        className="truncate whitespace-nowrap hover:underline"
                        // The name goes to the board; the rest of the row opens the run.
                        onClick={(e) => e.stopPropagation()}
                      >
                        {m.title}
                      </AppLink>
                      <span className="num text-right">{s?.score != null ? formatScore(s.score) : ''}</span>
                      <span
                        className="num pr-1.5 text-right text-[13px] text-text-muted"
                        title={s?.timestamp ? formatDateTime(s.timestamp) : undefined}
                      >
                        {s?.timestamp ? formatDate(s.timestamp) : ''}
                      </span>
                      {/* Their clicks are their own, not the row's. */}
                      <span
                        className="flex items-center gap-2 pr-1.5 upto480:hidden [&_svg]:block"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {s ? <CommentButton note={s.note} size={18} /> : <span className="w-3.5" />}
                        {s ? (
                          <AutorenderLink run={s} game={PORTAL2} rendered={rendered} size={18} />
                        ) : (
                          <span className="w-3.5" />
                        )}
                        <YouTubeLink id={s?.youtubeId} size={18} />
                        <DemoLink demoId={s?.demoId} size={18} />
                      </span>
                    </div>
                    {open && s && (
                      <div className="pt-2 pb-3.5">
                        {renderRunDetails?.(
                          { ...s, players: s.partner ? [player, s.partner] : [player] },
                          m,
                          PORTAL2,
                          rendered,
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
