import { cn } from 'cn'
import type { ReactNode } from 'react'
import { AppLink } from '@/components/app-link'
import { TriangleDown, TriangleRight } from '@/components/icons'
import { MENU_ICONS, menuItem, menuPanel, useIsHere } from './menu-styles'
import type { MenuEntry, MoreEntry } from './nav-model'

/** A link row in a menu: icon (or chapter number), label, optional caret for a flyout. */
export function MenuLink({
  item,
  caret = false,
  also,
  className,
}: {
  item: MenuEntry
  caret?: boolean
  also?: string[]
  className?: string
}) {
  const here = useIsHere(item.to, also)
  const Icon = item.icon ? MENU_ICONS[item.icon] : null
  return (
    <AppLink
      href={item.to}
      className={cn(menuItem(here, item.highlight), className)}
      aria-current={here ? 'page' : undefined}
    >
      {item.number != null ? (
        <span className="num inline-block w-6 text-center text-text-muted">{item.number}</span>
      ) : Icon ? (
        <Icon className="size-6 shrink-0 stroke-[1.5]" />
      ) : null}
      <span className="flex-1">{item.label}</span>
      {caret && (
        <span className="ml-3 inline-flex text-text-muted upto1320:hidden">
          <TriangleRight size={10} />
        </span>
      )}
    </AppLink>
  )
}

/** The More menu's rows: outside links open in a new tab. */
export function MoreLink({ item }: { item: MoreEntry }) {
  const here = useIsHere(item.to)
  const Icon = MENU_ICONS[item.icon]
  const body = (
    <>
      <Icon className="size-6 shrink-0 stroke-[1.5]" />
      <span>{item.label}</span>
    </>
  )
  return item.href ? (
    <a className={menuItem(false)} href={item.href} target="_blank" rel="noreferrer">
      {body}
    </a>
  ) : (
    <AppLink href={item.to!} className={menuItem(here)} aria-current={here ? 'page' : undefined}>
      {body}
    </AppLink>
  )
}

/**
 * The arrow that opens a menu on phones and narrow windows (menus open on hover on wider screens,
 * so it's hidden there).
 */
export function ExpandButton({
  open,
  onToggle,
  label,
  className,
  touchOnly = false,
}: {
  open: boolean
  onToggle: () => void
  label: string
  className?: string
  /** Shown on touch screens of any width instead of on narrow ones (the game picker). */
  touchOnly?: boolean
}) {
  return (
    <button
      type="button"
      className={cn(
        'cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-text-2',
        touchOnly
          ? 'ml-0.5 hidden h-10 w-8 [@media(hover:none)]:inline-flex'
          : 'absolute top-0 right-3 hidden w-11 upto1320:inline-flex',
        className,
      )}
      aria-expanded={open}
      aria-label={`${open ? 'Close' : 'Open'} ${label}`}
      onClick={onToggle}
    >
      <TriangleDown size={12} className={cn('transition-transform', open && 'rotate-180')} />
    </button>
  )
}

/**
 * A hover dropdown under a top bar item; on narrow screens it's inline and shown when `expanded`.
 * Keyboard focus inside also holds it open (`:focus-visible`, not any focus: a click leaves focus on
 * the link, which kept a menu open beside the next one hovered).
 */
export function NavDropdown({ expanded, children }: { expanded: boolean; children: ReactNode }) {
  return (
    <div
      role="menu"
      className={cn(
        menuPanel,
        'invisible absolute top-[92px] -left-3 z-30 min-[1321px]:glass-float min-w-[220px] -translate-y-1 opacity-0 transition-[opacity,transform,visibility] duration-100',
        'group-hover/nav:visible group-hover/nav:translate-y-0 group-hover/nav:opacity-100 group-has-[:focus-visible]/nav:visible group-has-[:focus-visible]/nav:translate-y-0 group-has-[:focus-visible]/nav:opacity-100',
        'upto1320:visible upto1320:static upto1320:translate-y-0 upto1320:bg-transparent upto1320:pt-0 upto1320:pb-2 upto1320:pl-10 upto1320:opacity-100 upto1320:shadow-none',
        !expanded && 'upto1320:hidden',
      )}
    >
      {children}
    </div>
  )
}
