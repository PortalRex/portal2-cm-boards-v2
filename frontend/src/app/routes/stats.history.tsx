import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { StatsShell } from '@/components/stats-shell'
import { HistoryPanel } from '@/features/stats/components/wr-panels'

const text = z.string().optional().catch(undefined)

// Stats: History.
export const Route = createFileRoute('/stats/history')({
  validateSearch: z.looseObject({ view: text, game: text }),
  component: HistoryRoute,
})

function HistoryRoute() {
  const { view } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <StatsShell>
      <HistoryPanel
        view={view}
        onView={(v) =>
          void navigate({ search: (prev) => ({ ...prev, view: v || undefined }), replace: true })
        }
      />
    </StatsShell>
  )
}
