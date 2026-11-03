import { siteBackground } from '@/components/layouts/backgrounds'
import { Page } from '@/components/layouts/page'
import { useGame } from '@/hooks/use-game'
import { useSeason } from '@/hooks/use-season'
import type { ScoreUpdatesSearch } from '../utils/filters'
import { ActivityPanel } from './activity-panel'
import { RecapPanel } from './recap-panel'
import type { RenderScoreDetails } from './score-row'
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
  renderRunDetails?: RenderScoreDetails
}) {
  // The game picked under the logo, or the season of it picked in the list (?season=): the panels
  // follow the list.
  const base = useGame()
  const game = useSeason(base) ?? base
  return (
    <Page background={siteBackground} tint="mono">
      <div className="mb-[30px] grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-[30px] upto1000:grid-cols-1">
        <RecapPanel game={game} />
        <ActivityPanel game={game} />
      </div>
      <ScoreUpdatesList search={search} renderRunDetails={renderRunDetails} />
    </Page>
  )
}
