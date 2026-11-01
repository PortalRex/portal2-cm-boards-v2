import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { SettingsPage } from '@/features/settings/components/settings-page'
import { SETTINGS_TABS, type SettingsTab } from '@/features/settings/utils/tabs'

// ?tab=account opens the Account tab (e.g. back from signing in through Steam); Appearance otherwise.
export const Route = createFileRoute('/more/settings')({
  validateSearch: z.looseObject({ tab: z.enum(SETTINGS_TABS).optional().catch(undefined) }),
  component: SettingsRoute,
})

function SettingsRoute() {
  const { tab = 'appearance' } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <SettingsPage
      tab={tab}
      onTab={(t: SettingsTab) =>
        void navigate({
          search: (prev) => ({ ...prev, tab: t === 'appearance' ? undefined : t }),
          replace: true,
        })
      }
    />
  )
}
