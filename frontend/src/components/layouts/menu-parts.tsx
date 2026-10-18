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
        <Icon className="size-7 shrink-0" />
      ) : null}
      <span className="flex-1">{item.label}</span>
      {caret && (
        <span className="ml-3 inline-flex text-text-muted max-[1320px]:hidden">
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
      <Icon className="size-7 shrink-0" />
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
          : 'absolute top-0 right-3 hidden w-11 max-[1320px]:inline-flex',
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

/** A hover dropdown under a top bar item; on narrow screens it's inline and shown when `expanded`. */
export function NavDropdown({ expanded, children }: { expanded: boolean; children: ReactNode }) {
  return (
    <div
      role="menu"
      className={cn(
        menuPanel,
        'invisible absolute top-[92px] -left-3 z-30 min-w-[220px] -translate-y-1 opacity-0 transition-[opacity,transform,visibility] duration-100',
        'group-hover/nav:visible group-hover/nav:translate-y-0 group-hover/nav:opacity-100 group-focus-within/nav:visible group-focus-within/nav:translate-y-0 group-focus-within/nav:opacity-100',
        'max-[1320px]:visible max-[1320px]:static max-[1320px]:translate-y-0 max-[1320px]:bg-transparent max-[1320px]:pt-0 max-[1320px]:pb-2 max-[1320px]:pl-10 max-[1320px]:opacity-100 max-[1320px]:shadow-none',
        !expanded && 'max-[1320px]:hidden',
      )}
    >
      {children}
    </div>
  )
}
