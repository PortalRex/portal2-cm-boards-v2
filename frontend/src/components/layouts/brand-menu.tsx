import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { cn } from 'cn'
import { useState } from 'react'
import { setGame, useGame } from '@/hooks/use-game'
import { gameBranding, pickableGames, useCatalog } from '@/lib/catalog'
import { ExpandButton } from './menu-parts'
import { menuPanel } from './menu-styles'
import { pathForGame } from './nav-model'

/**
 * The logo (P2CM, PSM:CM for Mel): home on click; on hover (or its arrow on touch screens) the
 * games, by logo, to switch the whole site to.
 */
export function BrandMenu() {
  const catalog = useCatalog()
  const game = useGame()
  const navigate = useNavigate()
  const { pathname, searchStr } = useLocation()
  // Open for the page and game it was opened on, so either changing closes it.
  const here = `${game}|${pathname}`
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === here
  const setOpen = (on: boolean) => setOpenOn(on ? here : null)
  // After a pick the list stays shut while the pointer is still over it (it opens on hover).
  const [picked, setPicked] = useState(false)
  const games = pickableGames(catalog)
  const branding = gameBranding(catalog, game)
  const label = catalog.games[game]?.label

  const choose = (id: string) => {
    setOpen(false)
    setPicked(true)
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    if (id === game) return
    setGame(id)
    void navigate({ href: pathForGame(id, pathname, searchStr) })
  }

  return (
    <div
      className="group/brand relative flex items-center self-stretch"
      onMouseLeave={() => setPicked(false)}
    >
      <Link
        to="/"
        className="flex items-center gap-3.5"
        aria-label={`${label ?? 'Portal 2'} Challenge Mode boards home`}
        title={label}
      >
        <img src={branding.logo} alt="" className="h-[46px] w-auto upto1320:h-[34px]" />
        <span className="text-[40px] font-bold tracking-[0.01em] upto1320:text-[30px] upto480:text-[26px]">
          {branding.brand}
        </span>
      </Link>
      {games.length > 1 && (
        <>
          <ExpandButton
            touchOnly
            open={open}
            label="games"
            onToggle={() => {
              setPicked(false)
              setOpen(!open)
            }}
          />
          <div
            role="menu"
            aria-label="Game"
            className={cn(
              menuPanel,
              'glass-float invisible absolute top-full -left-3 z-30 flex min-w-[260px] -translate-y-1 flex-col py-2 opacity-0 transition-[opacity,transform,visibility] duration-100',
              '[@media(hover:hover)]:group-hover/brand:visible [@media(hover:hover)]:group-hover/brand:translate-y-0 [@media(hover:hover)]:group-hover/brand:opacity-100 group-has-[:focus-visible]/brand:visible group-has-[:focus-visible]/brand:translate-y-0 group-has-[:focus-visible]/brand:opacity-100',
              open && 'visible translate-y-0 opacity-100',
              picked && 'invisible! opacity-0!',
            )}
          >
            {games.map((g) => (
              <button
                key={g.id}
                type="button"
                role="menuitemradio"
                aria-checked={g.id === game}
                onClick={() => choose(g.id)}
                className={cn(
                  'flex cursor-pointer items-center gap-3.5 border-0 bg-transparent px-[18px] py-2 text-left text-[19px] whitespace-nowrap text-foreground hover:bg-control-raised',
                  g.id === game && 'shadow-[inset_3px_0_0_var(--brand)]',
                )}
              >
                <img src={gameBranding(catalog, g.id).logo} alt="" className="h-9 w-auto shrink-0" />
                <span>{g.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
