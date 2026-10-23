import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { AdminPage, type AdminSection } from '@/features/admin/components/admin-page'

const SECTIONS = ['log', 'reports', 'games', 'jobs'] as const

// The staff panel. ?section=reports (or games, jobs) opens that part, e.g. from the staff inbox.
// Who may see what is checked on the page, as legacy did: visitors and players get a note.
export const Route = createFileRoute('/admin')({
  validateSearch: z.looseObject({ section: z.enum(SECTIONS).optional().catch(undefined) }),
  component: AdminRoute,
})

function AdminRoute() {
  const { section = 'log' } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <AdminPage
      section={section}
      onSection={(s: AdminSection) =>
        void navigate({
          search: (prev) => ({ ...prev, section: s === 'log' ? undefined : s }),
          replace: true,
        })
      }
    />
  )
}
