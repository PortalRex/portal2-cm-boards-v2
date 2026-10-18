import type { ReactNode } from 'react'
import { ROLE_LABELS } from '@/lib/auth'
import { youtubeChannelLabel, youtubeChannelUrl } from '@/lib/youtube'
import type { ProfilePlayer } from '../types'

function Entry({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-text-muted uppercase">{term}</dt>
      <dd className="m-0 [&_a:hover]:underline">{children}</dd>
    </>
  )
}

export function InfoTab({ player }: { player: ProfilePlayer }) {
  const youtube = youtubeChannelUrl(player.youtube)
  return (
    <dl className="m-0 grid grid-cols-[160px_1fr] gap-x-5 gap-y-2.5 text-lg">
      <Entry term="Steam ID">
        <span className="num">{player.steam}</span>
      </Entry>
      {player.titles.length > 0 && (
        <Entry term="Titles">
          <span className="flex flex-wrap gap-1.5">
            {player.titles.map((t) => (
              <span key={t} className="rounded-[4px] bg-[#3f7f7a] px-3 py-0.5 text-base text-white">
                {t}
              </span>
            ))}
          </span>
        </Entry>
      )}
      {player.role && <Entry term="Staff">{ROLE_LABELS[player.role as keyof typeof ROLE_LABELS]}</Entry>}
      {player.twitch && (
        <Entry term="Twitch">
          <a href={`https://twitch.tv/${player.twitch}`} target="_blank" rel="noreferrer">
            {player.twitch}
          </a>
        </Entry>
      )}
      {player.youtube && (
        <Entry term="YouTube">
          <a href={youtube ?? undefined} target="_blank" rel="noreferrer">
            {youtubeChannelLabel(player.youtube)}
          </a>
        </Entry>
      )}
    </dl>
  )
}
