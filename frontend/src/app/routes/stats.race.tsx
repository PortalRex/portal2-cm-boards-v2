import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { StatsShell } from '@/components/stats-shell'
import { RacePanel } from '@/features/stats/components/wr-panels'

const text = z.string().optional().catch(undefined)

// Stats: Race.
export const Route = createFileRoute('/stats/race')({
  validateSearch: z.looseObject({ board: text, game: text }),
  component: RaceRoute,
})

function RaceRoute() {
  const { board } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <StatsShell>
      <RacePanel
        board={board}
        onBoard={(v) =>
          void navigate({ search: (prev) => ({ ...prev, board: v || undefined }), replace: true })
        }
      />
    </StatsShell>
  )
}
