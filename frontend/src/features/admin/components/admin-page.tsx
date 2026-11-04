import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { MoreIcon } from '@/components/icons'
import { siteBackground } from '@/components/layouts/backgrounds'
import { Page } from '@/components/layouts/page'
import { Panel } from '@/components/panel'
import { Segmented } from '@/components/segmented'
import { EmptyState } from '@/components/status'
import { useCurrentUser } from '@/hooks/use-current-user'
import { isRoleAdmin, isStaff } from '@/lib/auth'
import { reportCountQueryOptions } from '../api/audit'
import { heldDemoCountQueryOptions } from '../api/held-demos'
import { AuditLog } from './audit-log'
import { BackgroundJobs } from './background-jobs'
import { GamesEditor } from './games/games-editor'
import { HeldDemos } from './held-demos'
import { Reports } from './reports'

export type AdminSection = 'log' | 'reports' | 'held' | 'games' | 'jobs'

const TITLES: Record<AdminSection, string> = {
  log: 'Admin changelog',
  reports: 'Run reports',
  held: 'Held demos',
  games: 'Games and maps',
  jobs: 'Background jobs',
}

/**
 * The staff panel: the audit log, run reports and held demos for every staff tier; the games
 * editor and background jobs for admins. Visitors and players get a note instead (the server refuses them
 * anyway); viewing as a player counts as a player.
 */
export function AdminPage({
  section,
  onSection,
}: {
  section: AdminSection
  onSection: (s: AdminSection) => void
}) {
  const user = useCurrentUser()
  const staff = isStaff(user)
  const admin = isRoleAdmin(user)
  const openReports = useQuery({ ...reportCountQueryOptions(), enabled: staff }).data
  const heldDemos = useQuery({ ...heldDemoCountQueryOptions(), enabled: staff }).data
  // A section the user can't open shows the changelog, as legacy did.
  const shown: AdminSection =
    ((section === 'reports' || section === 'held') && staff) ||
    ((section === 'games' || section === 'jobs') && admin)
      ? section
      : 'log'

  const options: { value: AdminSection; label: ReactNode }[] = [
    { value: 'log', label: 'Changelog' },
    { value: 'reports', label: <Counted label="Reports" count={openReports} /> },
    // Refused demos kept for staff ("Held demos").
    { value: 'held', label: <Counted label="Demos" count={heldDemos} /> },
    ...(admin
      ? [
          { value: 'games' as const, label: 'Games' },
          { value: 'jobs' as const, label: 'Jobs' },
        ]
      : []),
  ]

  return (
    <Page background={siteBackground} tint="mono">
      <Panel
        icon={MoreIcon}
        title={TITLES[shown]}
        actions={
          staff && (
            <Segmented
              label="Section"
              value={shown}
              onChange={onSection}
              options={options}
              // Five sections and their counts fit a phone's width: each as wide as its label
              // (Reports and Demos carry counts), sharing what's left.
              itemClassName="upto480:flex-auto upto480:px-2 upto480:text-base"
            />
          )
        }
        bodyClassName="px-8 pt-6 pb-[30px] upto700:px-4"
      >
        {!user ? (
          <EmptyState>Sign in with an admin account to see the admin changelog.</EmptyState>
        ) : !staff ? (
          <EmptyState>Staff only.</EmptyState>
        ) : shown === 'reports' ? (
          <Reports />
        ) : shown === 'held' ? (
          <HeldDemos />
        ) : shown === 'jobs' ? (
          <BackgroundJobs />
        ) : shown === 'games' ? (
          <GamesEditor />
        ) : (
          <AuditLog />
        )}
      </Panel>
    </Page>
  )
}

/** A section's label with how many wait in it. */
function Counted({ label, count }: { label: string; count: number | undefined }) {
  return (
    <>
      {label}
      {count ? (
        <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-[10px] bg-banned px-1.5 text-[13px] font-semibold text-banned-text">
          {count}
        </span>
      ) : null}
    </>
  )
}
