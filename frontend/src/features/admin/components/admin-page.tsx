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
import { AuditLog } from './audit-log'
import { BackgroundJobs } from './background-jobs'
import { GamesEditor } from './games/games-editor'
import { Reports } from './reports'

export type AdminSection = 'log' | 'reports' | 'games' | 'jobs'

const TITLES: Record<AdminSection, string> = {
  log: 'Admin changelog',
  reports: 'Run reports',
  games: 'Games and maps',
  jobs: 'Background jobs',
}

/**
 * The staff panel: the audit log and run reports for every staff tier; the games editor and
 * background jobs for admins. Visitors and players get a note instead (the server refuses them
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
  // A section the user can't open shows the changelog, as legacy did.
  const shown: AdminSection =
    (section === 'reports' && staff) || ((section === 'games' || section === 'jobs') && admin)
      ? section
      : 'log'

  const options: { value: AdminSection; label: ReactNode }[] = [
    { value: 'log', label: 'Changelog' },
    {
      value: 'reports',
      label: (
        <>
          Reports
          {openReports ? (
            <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-[10px] bg-banned px-1.5 text-[13px] font-semibold text-banned-text">
              {openReports}
            </span>
          ) : null}
        </>
      ),
    },
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
              // Four sections and the reports count fit a phone's width: each as wide as its
              // label (Reports carries the count), sharing what's left.
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
