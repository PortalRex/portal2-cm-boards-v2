import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Avatar } from '@/components/avatar'
import { siteBackground } from '@/components/layouts/backgrounds'
import { Page } from '@/components/layouts/page'
import { MoreIcon } from '@/components/icons'
import { Panel } from '@/components/panel'
import { SearchBox } from '@/components/search-box'
import { EmptyState, ErrorState, Loading } from '@/components/status'
import type { Player } from '@/types/runs'
import { wallOfShameQueryOptions } from '../api/wall-of-shame'

/** Players banned from the boards (their runs are hidden everywhere), searchable by name or Steam id. */
export function WallOfShamePage() {
  const banned = useQuery(wallOfShameQueryOptions())
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const all = banned.data ?? []
  const players = all.filter(
    (p) => !q || p.name.toLowerCase().includes(q) || Boolean(p.profileNumber?.includes(q)),
  )

  return (
    <Page background={siteBackground} tint="mono">
      <Panel icon={MoreIcon} title="Wall Of Shame" bodyClassName="px-8 pt-6 pb-8">
        <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-3">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search banned players"
            showFilter={false}
          />
          {banned.data && (
            <span className="text-text-muted">
              {players.length === all.length
                ? `${all.length} banned players`
                : `${players.length} of ${all.length}`}
            </span>
          )}
        </div>
        {banned.isPending ? (
          <Loading />
        ) : banned.isError ? (
          <ErrorState error={banned.error} onRetry={() => void banned.refetch()} />
        ) : players.length === 0 ? (
          <EmptyState>{search ? `No banned players match “${search}”.` : 'Nobody is banned.'}</EmptyState>
        ) : (
          <ul
            aria-label="Banned players"
            className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5 p-0"
          >
            {players.map((p) => (
              <li key={p.profileNumber}>
                <BannedCard player={p} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Page>
  )
}

function BannedCard({ player }: { player: Player }) {
  return (
    <Link
      to="/profile/$profileId"
      params={{ profileId: player.profileNumber ?? '' }}
      className="grid grid-cols-[56px_minmax(0,1fr)] grid-rows-[auto_auto] items-center gap-x-3 rounded-md bg-row p-2 hover:bg-seg-hover"
    >
      <Avatar src={player.avatar} name={player.name} size={56} className="row-span-2 rounded-[6px]" />
      <span className="self-end truncate text-lg">{player.name}</span>
      <span className="num self-start text-[13px] text-text-muted">{player.profileNumber}</span>
    </Link>
  )
}
