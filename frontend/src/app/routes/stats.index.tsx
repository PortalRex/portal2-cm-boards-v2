import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { StatsShell } from '@/components/stats-shell'
import { RunnersPanel } from '@/features/stats/components/runners-panel'

const text = z.string().optional().catch(undefined)

// Stats: Runners.
export const Route = createFileRoute('/stats/')({
  validateSearch: z.looseObject({ board: text, game: text }),
  component: RunnersRoute,
})

function RunnersRoute() {
  const { board } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <StatsShell>
      <RunnersPanel
        board={board}
        // Like legacy, other parameters stay; the default board leaves the address.
        onBoard={(b) =>
          void navigate({ search: (prev) => ({ ...prev, board: b || undefined }), replace: true })
        }
      />
    </StatsShell>
  )
}
