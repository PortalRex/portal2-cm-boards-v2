import { cn } from 'cn'
import { useGame } from '@/hooks/use-game'
import { useCatalog } from '@/lib/catalog'
import { MenuLink } from './menu-parts'
import { menuPanel } from './menu-styles'
import { aggregateMenu, type MenuEntry } from './nav-model'

/**
 * The selected game's boards (Overall, its modes; Portal 2's single player and co-op boards fly
 * out to Total and each chapter), then its seasons. On narrow screens only the boards are listed
 * (legacy hides every flyout there).
 */
export function AggregateMenuItems() {
  const catalog = useCatalog()
  const game = useGame()
  return (
    <>
      {aggregateMenu(catalog, game).map((board) => (
        <BoardGroup key={board.label} board={board} />
      ))}
    </>
  )
}

function BoardGroup({ board }: { board: MenuEntry }) {
  const chapters = board.chapters ?? []
  return (
    <div className="group/board relative">
      <MenuLink
        item={board}
        caret={chapters.length > 0}
        also={chapters.map((c) => c.to)}
        className="group-hover/board:bg-control-raised upto1320:group-hover/board:bg-transparent"
      />
      {chapters.length > 0 && (
        <div
          className={cn(
            menuPanel,
            'invisible absolute -top-2.5 left-full min-w-[240px] opacity-0 transition-[opacity,visibility] duration-100',
            'group-hover/board:visible group-hover/board:opacity-100 group-focus-within/board:visible group-focus-within/board:opacity-100',
            'upto1320:hidden',
          )}
        >
          {!board.noTotal && <MenuLink item={{ label: 'Total', icon: 'star', to: board.to }} />}
          {chapters.map((c) => (
            <MenuLink key={c.to} item={c} />
          ))}
        </div>
      )}
    </div>
  )
}
