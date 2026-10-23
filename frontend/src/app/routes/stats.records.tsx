import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { StatsShell } from '@/components/stats-shell'
import { RecordsPanel } from '@/features/stats/components/wr-panels'

const text = z.string().optional().catch(undefined)

// Stats: Records.
export const Route = createFileRoute('/stats/records')({
  validateSearch: z.looseObject({ mode: text, game: text }),
  component: RecordsRoute,
})

function RecordsRoute() {
  const { mode } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <StatsShell>
      <RecordsPanel
        mode={mode}
        onMode={(v) =>
          void navigate({ search: (prev) => ({ ...prev, mode: v || undefined }), replace: true })
        }
      />
    </StatsShell>
  )
}
