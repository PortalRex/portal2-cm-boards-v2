import { cn } from 'cn'
import { AppLink } from '@/components/app-link'
import { TrophyFilledIcon } from '@/components/icons'
import { PlayerLink } from '@/components/player-link'
import { AutorenderLink, DemoLink, YouTubeLink } from '@/components/runs/run-media'
import { TimeButton } from '@/components/runs/time-button'
import { useCurrentUser } from '@/hooks/use-current-user'
import { mapLink, useCatalog, type MapInfo } from '@/lib/catalog'
import type { PreviewRun } from '@/types/runs'

/**
 * A run's demo / video icons, each in its own fixed-width column. The autorender and YouTube
 * columns are always kept, right before the time, so the play icon sits in the same place on every
 * card and row whether or not there's a YouTube video.
 */
function ScoreIcons({
  entry,
  game,
  size,
  demoColumn,
}: {
  entry: PreviewRun
  game: string
  size: number
  demoColumn: boolean
}) {
  const slot = 'inline-flex w-7 justify-center'
  return (
    <span className="inline-flex items-center gap-0.5 upto700:hidden [&_svg]:block">
      {demoColumn && (
        <span className={slot}>
          <DemoLink demoId={entry.demoId} size={size} hideMissing />
        </span>
      )}
      <span className={slot}>
        {entry.autorenderId && <AutorenderLink run={entry} game={game} size={size + 2} />}
      </span>
      <span className={slot}>{entry.youtubeId && <YouTubeLink id={entry.youtubeId} size={size + 4} />}</span>
    </span>
  )
}

/** A map in the list: its picture and name, the world record and the next six times. */
export function MapCard({ map, scores }: { map: MapInfo; scores: PreviewRun[] | undefined }) {
  const catalog = useCatalog()
  const me = useCurrentUser()
  const isMine = (entry: PreviewRun | undefined) =>
    Boolean(me && !me.sample && entry?.players.some((p) => p.profileNumber === me.profileNumber))
  const [wr, ...rest] = scores ?? []
  const shown = rest.slice(0, 6)
  // One set of icon columns for the whole card (WR row included), so icons line up.
  const demoColumn = [wr, ...shown].some((e) => e?.demoId)

  return (
    <article className="min-w-0 border-t-[3px] border-brand bg-panel">
      <AppLink
        href={mapLink(catalog, map)}
        className="group/head relative flex h-[77px] items-center justify-center bg-cover bg-center px-2.5 before:absolute before:inset-0 before:bg-black/35 before:transition-colors before:content-[''] hover:before:bg-black/15 upto700:h-[58px] upto700:px-1.5"
        style={{ backgroundImage: map.image ? `url("${map.image}")` : undefined }}
      >
        <h3 className="relative m-0 text-center text-[27px] leading-none font-semibold text-white uppercase [text-shadow:0_1px_6px_rgba(0,0,0,0.6)] upto700:text-base">
          {map.title}
        </h3>
      </AppLink>
      <div
        className={cn(
          'flex min-h-10 items-center gap-2 bg-wr-row py-0.5 pr-2.5 pl-2 upto700:min-h-9 upto700:gap-1.5 upto700:px-1.5',
          isMine(wr) && 'me-row',
        )}
      >
        <TrophyFilledIcon className="size-[26px] shrink-0 text-trophy upto700:size-[18px]" />
        {wr ? (
          <>
            {/* Same order as the rows below: name, video / demo, time. */}
            <div className="flex min-w-0 flex-1 flex-col leading-[1.05]">
              {wr.players.map((p, i) => (
                <PlayerLink
                  key={i}
                  player={p}
                  className="truncate text-[17px] leading-[1.3] upto700:text-sm"
                />
              ))}
            </div>
            <ScoreIcons entry={wr} game={map.game} size={22} demoColumn={demoColumn} />
            <TimeButton
              score={wr.score}
              players={wr.players}
              map={map}
              className="min-w-[60px] shrink-0 text-right text-[17px] font-semibold text-foreground upto700:text-[13px]"
            />
          </>
        ) : (
          <span className="text-text-muted">{scores ? 'No scores yet' : ''}</span>
        )}
      </div>
      <ol className="m-0 list-none p-0" start={2}>
        {shown.map((entry, i) => (
          <li
            key={i}
            className={cn(
              'flex h-6 items-center gap-2 pr-2.5 pl-3 text-base odd:bg-row upto700:h-[22px] upto700:px-1.5 upto700:text-[13px] upto700:nth-[n+3]:hidden',
              isMine(entry) && 'me-row',
            )}
          >
            <span className="min-w-0 flex-1 truncate leading-[1.3] text-text-2 [&_a]:text-inherit [&_a:hover]:text-foreground [&_a:hover]:underline">
              {entry.players.map((p, j) => (
                <span key={p.profileNumber ?? j}>
                  {j > 0 && ' & '}
                  <PlayerLink player={p} />
                </span>
              ))}
            </span>
            <ScoreIcons entry={entry} game={map.game} size={18} demoColumn={demoColumn} />
            <TimeButton
              score={entry.score}
              players={entry.players}
              map={map}
              className="min-w-[60px] shrink-0 text-right font-semibold"
            />
          </li>
        ))}
      </ol>
    </article>
  )
}
