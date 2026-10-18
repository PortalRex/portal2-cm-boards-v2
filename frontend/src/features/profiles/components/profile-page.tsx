import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { cn } from 'cn'
import type { ReactNode } from 'react'
import { HistoryIcon, TriangleDown } from '@/components/icons'
import { Page } from '@/components/layouts/page'
import { Card } from '@/components/panel'
import { EmptyState, Loading } from '@/components/status'
import { useCollapsedGroup } from '@/hooks/use-collapsed'
import { useCatalog } from '@/lib/catalog'
import { playerRole } from '@/lib/data/roles'
import { formatDate } from '@/lib/format'
import { pointsPeakQueryOptions, profileAtQueryOptions, profileQueryOptions } from '../api/profile'
import type { Profile, ProfilePlayer, RenderRunDetails } from '../types'
import { profileAsOf, validDay } from '../utils/profile'
import { ActivityHeatmap } from './activity-heatmap'
import { FollowButton } from './follow-button'
import { PointsChart } from './points-chart'
import { ProfileHeader } from './profile-header'
import { GlobalRankCard, PointsCard, SideCards, StatisticsCard } from './profile-stats'
import { ProfileTabs } from './profile-tabs'

// The profile's cards above the tabs.
const PROFILE_CARDS = [
  'profile.points',
  'profile.rank',
  'profile.stats',
  'profile.average',
  'profile.wrs',
  'profile.peak',
  'profile.activity',
]

/** Opens or closes every card above the tabs at once (each still opens on its own too). */
function CollapseAll() {
  const [all, toggleAll] = useCollapsedGroup(PROFILE_CARDS)
  return (
    <div className="-mt-1.5 mb-2 flex justify-end">
      <button
        type="button"
        onClick={toggleAll}
        aria-expanded={!all}
        className="inline-flex cursor-pointer items-center gap-2 rounded-md border-0 bg-card-head px-3 py-1 text-[15px] text-text-2 hover:bg-control-raised hover:text-foreground"
      >
        {all ? 'Expand all' : 'Collapse all'}
        <TriangleDown size={11} className={cn('transition-transform duration-150', !all && 'rotate-180')} />
      </button>
    </div>
  )
}

export interface ProfileSlots {
  renderRunDetails?: RenderRunDetails
  /** Staff tools for the player (features/admin), at the end of the header's buttons. */
  staffTools?: (player: ProfilePlayer) => ReactNode
}

/** A player's profile page; each player gets a fresh page (the route keys it by player). */
export function ProfilePage({
  profileId,
  at: atParam,
  renderRunDetails,
  staffTools,
}: { profileId: string; at?: string } & ProfileSlots) {
  const catalog = useCatalog()
  const navigate = useNavigate()
  const profile = useQuery(profileQueryOptions(catalog, profileId))
  const p = profile.data
  const at = validDay(atParam)
  const peak = useQuery({ ...pointsPeakQueryOptions(profileId), enabled: Boolean(p) })
  const past = useQuery({ ...profileAtQueryOptions(profileId, at ?? ''), enabled: Boolean(p && at) })
  // Like legacy, picking a day (or going back to today) starts the address afresh.
  const pickDay = (day: string | null) =>
    void navigate({ to: '.', search: day ? { at: day } : {}, replace: true })

  if (profile.isPending) {
    return (
      <Page blur>
        <Loading label="Loading profile" />
      </Page>
    )
  }
  if (!p) {
    return (
      <Page blur>
        <EmptyState>Couldn’t load this profile.</EmptyState>
      </Page>
    )
  }
  const view: Profile = at && past.data ? profileAsOf(catalog, p, past.data, at) : p
  // Legends is kept once a peak reached it: the server records when, so the name has its colour
  // as soon as the profile loads (as of a past day, only if it was reached by then).
  const legendsAt = p.player.legendsAt?.slice(0, 10) ?? null
  const keptLegends = Boolean(legendsAt && (!at || legendsAt <= at))
  const peakData = peak.isSuccess ? peak.data : null
  const role = playerRole(view.points, at ? null : peakData, keptLegends)

  return (
    <Page background={p.player.avatar} blur>
      <div className="mx-auto max-w-[1440px]">
        {at && (
          <AsOfBanner
            name={p.player.name}
            day={at}
            loading={past.isPending}
            failed={past.isError}
            onClear={() => pickDay(null)}
          />
        )}
        <CollapseAll />
        <Row className="grid-cols-[minmax(0,2.55fr)_minmax(0,1fr)]">
          <ProfileHeader
            player={p.player}
            role={role}
            actions={<FollowButton player={p.player} />}
            after={staffTools?.(p.player)}
          />
          <PointsCard profile={view} />
        </Row>
        <Row className="grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <GlobalRankCard
            profile={view}
            chart={
              <PointsChart profileNumber={p.player.profileNumber} peak={peakData} at={at} onPick={pickDay} />
            }
          />
          <StatisticsCard profile={view} />
          <SideCards profile={view} peak={peakData} />
        </Row>
        {p.history.length > 0 && (
          <Card icon={HistoryIcon} title="Activity" collapseId="profile.activity" className="mb-5">
            <ActivityHeatmap history={p.history} />
          </Card>
        )}
        <ProfileTabs profile={view} renderRunDetails={renderRunDetails} />
      </div>
    </Page>
  )
}

function Row({ className, children }: { className: string; children: ReactNode }) {
  return <div className={cn('mb-5 grid gap-5 max-[1200px]:grid-cols-1', className)}>{children}</div>
}

function AsOfBanner({
  name,
  day,
  loading,
  failed,
  onClear,
}: {
  name: string
  day: string
  loading: boolean
  failed: boolean
  onClear: () => void
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border border-brand bg-[color-mix(in_srgb,var(--brand)_14%,var(--panel))] px-3.5 py-2.5">
      <span>
        {loading ? 'Loading ' : 'Showing '}
        {name}’s profile as it was on <strong className="num">{formatDate(day)}</strong>
        {failed ? ' (couldn’t load that day)' : ''}
      </span>
      <button
        type="button"
        onClick={onClear}
        className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-brand hover:underline"
      >
        Back to today
      </button>
    </div>
  )
}
