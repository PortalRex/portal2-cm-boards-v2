import type { ReactNode } from 'react'
import { siteBackground } from '@/components/layouts/backgrounds'
import { Page } from '@/components/layouts/page'
import type { Run } from '@/types/runs'
import type { ScoreUpdatesSearch } from '../utils/filters'
import { ScoreUpdatesList } from './score-updates-list'

/**
 * The home page: the weekly recap / daily chambers / following and activity panels, then the
 * score updates. Rows open Run Details through `renderRunDetails` (a slot the route fills).
 */
export function ScoreUpdatesPage({
  search,
  renderRunDetails,
}: {
  search: ScoreUpdatesSearch
  renderRunDetails?: (run: Run, rendered: Map<number, string>) => ReactNode
}) {
  return (
    <Page background={siteBackground} tint="mono">
      <ScoreUpdatesList search={search} renderRunDetails={renderRunDetails} />
    </Page>
  )
}
