import { createFileRoute } from '@tanstack/react-router'
import { StatsShell } from '@/components/stats-shell'
import { CountriesPanel } from '@/features/countries/components/countries-panel'

// Countries on a Portal 2 points board.
export const Route = createFileRoute('/stats/countries')({
  component: () => (
    <StatsShell>
      <CountriesPanel />
    </StatsShell>
  ),
})
