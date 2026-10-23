import { useQuery } from '@tanstack/react-query'
import { cn } from 'cn'
import { useState, type ReactNode } from 'react'
import { AppLink } from '@/components/app-link'
import { Avatar } from '@/components/avatar'
import { PlayerLink } from '@/components/player-link'
import { SeasonSelect } from '@/components/season-select'
import { EmptyState, Loading } from '@/components/status'
import { mapPath, useCatalog } from '@/lib/catalog'
import { formatDate, formatScore, timeAgo } from '@/lib/format'
import { PORTAL2 } from '@/lib/catalog'
import type { Run } from '@/types/runs'
import { gameResultsQueryOptions, profileStatsQueryOptions } from '../api/profile'
import { AllTimes } from './all-times'
import { SectionTitle } from './score-tables'

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '–')

function Figure({
  label,
  value,
  note,
  hide = false,
}: {
  label: string
  value: ReactNode
  note?: string
  hide?: boolean
}) {
  if (hide) return null
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-row px-4 py-3.5">
      <span className="text-sm tracking-[0.04em] text-text-muted uppercase">{label}</span>
      <span className="num text-[28px] font-semibold">{value}</span>
      {note && <span className="text-sm text-text-muted">{note}</span>}
    </div>
  )
}

const listRow = 'grid min-h-10 grid-cols-[minmax(0,1fr)_140px_80px] items-center gap-3 px-3 text-base'
// Legacy striped the odd children: under the partners' header row that's the 1st, 3rd, ... row;
// the portals list has no header, so there it's the 2nd, 4th, ...
const stripe = (on: boolean) => (on ? 'bg-row' : undefined)

/**
 * Activity, co-op partners and demo stats for one game (or one of its seasons), and every time the
 * player has set in it. `portal2History` is the profile's own list of Portal 2 runs (already loaded);
 * other games' and seasons' runs come with their results.
 */
export function StatsTab({
  profileNumber,
  game,
  portal2History,
}: {
  profileNumber: string
  game: string
  portal2History: Run[]
}) {
  const catalog = useCatalog()
  const [season, setSeason] = useState<string | null>(null)
  const source = season ?? game
  const stats = useQuery(profileStatsQueryOptions(catalog, profileNumber, source))
  const results = useQuery({
    ...gameResultsQueryOptions(catalog, profileNumber, source),
    enabled: source !== PORTAL2,
  })
  const runs = source === PORTAL2 ? portal2History : (results.data?.history ?? [])
  const s = stats.data?.summary
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <SeasonSelect base={game} season={season} onChange={setSeason} />
      </div>
      {stats.isPending ? (
        <Loading label="Loading stats" />
      ) : !s || !stats.data ? (
        <EmptyState>No stats for this player.</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
            <Figure label="Runs" value={s.runs} note={`${s.verified_runs} verified`} />
            <Figure
              label="Singleplayer maps"
              value={`${s.sp_maps} / ${s.sp_map_count}`}
              note={pct(s.sp_maps, s.sp_map_count)}
              hide={!s.sp_map_count}
            />
            <Figure
              label="Co-op maps"
              value={`${s.coop_maps} / ${s.coop_map_count}`}
              note={pct(s.coop_maps, s.coop_map_count)}
              hide={!s.coop_map_count}
            />
            <Figure label="Co-op partners" value={stats.data.uniquePartners} hide={!s.coop_map_count} />
            <Figure
              label="World records"
              value={s.wr_runs}
              note={s.wr_runs ? `held on ${s.wr_maps} map${s.wr_maps === 1 ? '' : 's'}` : 'none yet'}
            />
            <Figure label="Time saved" value={formatScore(s.time_saved)} note="through improvements" />
            <Figure
              label="With demo"
              value={pct(s.runs_with_demo, s.runs)}
              note={`${s.runs_with_demo} runs`}
            />
            <Figure
              label="With video"
              value={pct(s.runs_with_video, s.runs)}
              note={`${s.runs_with_video} runs`}
            />
            <Figure
              label="Portals per PB"
              value={s.pbs_with_portals ? (s.pb_portals_total / s.pbs_with_portals).toFixed(1) : '–'}
              note={
                s.pbs_with_portals ? `${s.pb_portals_total} over ${s.pbs_with_portals} maps` : 'no demo data'
              }
            />
            <Figure
              label="Portals placed"
              value={s.portals_total.toLocaleString()}
              note={`in ${s.runs_with_portals} runs with demos`}
              hide={!s.runs_with_portals}
            />
            <Figure
              label="Active"
              value={s.first_run ? formatDate(s.first_run).slice(0, 4) : '–'}
              note={s.latest_run ? `latest run ${timeAgo(s.latest_run)}` : ''}
            />
          </div>
          {stats.data.partners.length > 0 && (
            <section className="flex max-w-[820px] flex-col">
              <SectionTitle>Co-op partners</SectionTitle>
              <div className={cn(listRow, 'min-h-8 text-sm text-text-muted uppercase')}>
                <span>Partner</span>
                <span className="text-right">Maps together</span>
                <span className="text-right">Runs</span>
              </div>
              {stats.data.partners.map((p, i) => (
                <div key={p.player.profileNumber} className={cn(listRow, stripe(i % 2 === 0))}>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Avatar src={p.player.avatar} name={p.player.name} size={28} />
                    <PlayerLink player={p.player} />
                  </span>
                  <span className="num text-right">{p.maps}</span>
                  <span className="num text-right text-text-muted">{p.runs}</span>
                </div>
              ))}
              {stats.data.uniquePartners > stats.data.partners.length && (
                <p className="mx-3 mt-2 mb-0 text-text-muted">
                  and {stats.data.uniquePartners - stats.data.partners.length} more
                </p>
              )}
            </section>
          )}
          {stats.data.fewestPortals.length > 0 && (
            <section className="flex max-w-[820px] flex-col">
              <SectionTitle>Fewest portals (personal bests)</SectionTitle>
              {stats.data.fewestPortals.map((f, i) => (
                <div key={f.mapName} className={cn(listRow, stripe(i % 2 === 1))}>
                  <span>
                    {f.map ? (
                      <AppLink href={mapPath(f.map)} className="hover:underline">
                        {f.map.title}
                      </AppLink>
                    ) : (
                      f.mapName
                    )}
                  </span>
                  <span className="num text-right">{f.portals} portals</span>
                  <span className="num text-right text-text-muted">{formatScore(f.score)}</span>
                </div>
              ))}
            </section>
          )}
        </>
      )}
      {source !== PORTAL2 && results.isPending ? (
        <Loading label="Loading times" />
      ) : (
        <AllTimes key={source} runs={runs} />
      )}
    </div>
  )
}
