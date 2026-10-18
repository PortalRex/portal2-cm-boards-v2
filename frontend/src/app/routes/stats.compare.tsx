import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { StatsShell } from '@/components/stats-shell'
import { ComparePanel } from '@/features/compare/components/compare-panel'

const text = z.string().optional().catch(undefined)

// Compare two players: ?a=&b= (Steam ids), ?mode=, ?season=.
export const Route = createFileRoute('/stats/compare')({
  validateSearch: z.looseObject({ a: text, b: text, mode: text, season: text, game: text }),
  component: CompareRoute,
})

function CompareRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <StatsShell>
      <ComparePanel
        search={search}
        // Like legacy, empty values leave the address and the other parameters stay.
        onChange={(changes) =>
          void navigate({
            search: (prev) => {
              const next: Record<string, unknown> = { ...prev }
              for (const [k, v] of Object.entries(changes)) next[k] = v || undefined
              return next
            },
            replace: true,
          })
        }
      />
    </StatsShell>
  )
}
