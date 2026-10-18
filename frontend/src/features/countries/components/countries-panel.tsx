import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { useState } from 'react'
import { AppLink } from '@/components/app-link'
import { Avatar, Flag } from '@/components/avatar'
import { GlobeIcon } from '@/components/icons'
import { Panel } from '@/components/panel'
import { PlayerLink } from '@/components/player-link'
import { Segmented } from '@/components/segmented'
import { EmptyState, Loading } from '@/components/status'
import { formatPoints } from '@/lib/format'
import { countryStatsQueryOptions } from '../api/countries'

const BOARDS = [
  { value: 'overall', label: 'Overall' },
  { value: 'sp', label: 'Singleplayer' },
  { value: 'coop', label: 'Cooperative' },
]

const row =
  'grid min-h-11 grid-cols-[40px_minmax(160px,1fr)_80px_100px_minmax(0,3fr)] items-center gap-x-4 px-3 py-1.5 text-base upto800:grid-cols-[30px_minmax(0,1fr)_60px]'
const desktop = 'upto800:hidden'

/**
 * Countries on a Portal 2 points board: how many players each has, their points together and its
 * best players. Players set their country in Settings. Like legacy, the board isn't kept in the
 * address.
 */
export function CountriesPanel() {
  const [board, setBoard] = useState('overall')
  const stats = useQuery(countryStatsQueryOptions(board))
  const list = stats.data ?? []
  const players = list.reduce((n, c) => n + c.players, 0)

  return (
    <Panel
      icon={GlobeIcon}
      title="Countries"
      className="rounded-tl-none"
      bodyClassName="px-7 pt-5 pb-7 upto800:p-4"
      actions={<Segmented value={board} onChange={setBoard} label="Board" options={BOARDS} />}
    >
      <p className="mt-0 mb-4 text-base text-text-muted">
        {list.length
          ? `${players} ranked players across ${list.length} countries. Set yours in `
          : 'No one has set a country yet. Set yours in '}
        <Link to="/more/settings" className="text-brand-light">
          Settings
        </Link>
        .
      </p>
      {stats.isPending ? (
        <Loading />
      ) : !list.length ? (
        <EmptyState>No countries yet.</EmptyState>
      ) : (
        <div role="table" aria-label="Countries">
          <div role="row" className={cn(row, 'min-h-[30px] text-sm text-text-muted uppercase')}>
            <span className="text-center">#</span>
            <span>Country</span>
            <span className="text-right">Players</span>
            <span className={cn('text-right', desktop)}>Points</span>
            <span className={desktop}>Best players</span>
          </div>
          {list.map((c, i) => (
            <div role="row" key={c.country?.code ?? i} className={cn(row, i % 2 === 0 && 'bg-row')}>
              <span className="num text-center text-text-muted">{i + 1}</span>
              <AppLink
                href={`/leaderboard/${board}?country=${c.country?.code ?? ''}`}
                title={`${c.country?.name} on the ${board} board`}
                className="inline-flex min-w-0 items-center gap-2 font-semibold hover:underline"
              >
                <Flag code={c.country?.code} height={18} />
                {c.country?.name ?? 'Unknown'}
              </AppLink>
              <span className="num text-right">{c.players}</span>
              <span className={cn('num text-right', desktop)}>{formatPoints(c.points)}</span>
              <span className={cn('flex min-w-0 flex-wrap gap-x-4 gap-y-1', desktop)}>
                {c.top.map((t, j) => (
                  <span
                    key={t.player.profileNumber}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap"
                    title={`${formatPoints(t.points)} points`}
                  >
                    <span className="num text-text-muted">{j + 1}.</span>
                    <Avatar src={t.player.avatar} name={t.player.name} size={22} />
                    <PlayerLink player={t.player} />
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
