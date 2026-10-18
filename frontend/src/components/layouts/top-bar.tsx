import { useLocation } from '@tanstack/react-router'
import { cn } from 'cn'
import { useState, type ComponentType } from 'react'
import { AppLink } from '@/components/app-link'
import {
  BarsIcon,
  CloseIcon,
  DarkModeIcon,
  HistoryIcon,
  LightModeIcon,
  MenuIcon,
  MoreIcon,
  PinIcon,
  StatsIcon,
  UploadIcon,
} from '@/components/icons'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useGame } from '@/hooks/use-game'
import { useTheme } from '@/hooks/use-theme'
import { isStaff } from '@/lib/auth'
import { gameBoardsPath } from '@/lib/catalog'
import { AggregateMenuItems } from './aggregate-menu'
import { BrandMenu } from './brand-menu'
import { ExpandButton, MoreLink, NavDropdown } from './menu-parts'
import { isNavActive, MORE_MENU, NAV, type NavItem } from './nav-model'
import { ProfileMenu } from './profile-menu'
import { useLayoutSlots } from './slots'

const NAV_ICONS: Record<NavItem['icon'], ComponentType<{ className?: string }>> = {
  history: HistoryIcon,
  pin: PinIcon,
  bars: BarsIcon,
  stats: StatsIcon,
  more: MoreIcon,
}

function TopNavItem({ item }: { item: NavItem }) {
  const { pathname } = useLocation()
  const game = useGame()
  const Icon = NAV_ICONS[item.icon]
  // Aggregate opens the selected game's boards.
  const to = item.menu === 'aggregate' ? gameBoardsPath(game) : item.to
  const active = isNavActive(item, pathname)
  // Narrow screens: a menu stays closed until its arrow is tapped.
  const [expanded, setExpanded] = useState(false)
  return (
    <li className={cn('relative', item.menu && 'group/nav')}>
      <AppLink
        href={to}
        data-active={active || undefined}
        aria-current={active ? 'page' : undefined}
        className="group/link flex h-[110px] items-center gap-3 text-xl font-medium whitespace-nowrap uppercase max-[1320px]:h-[52px] max-[1320px]:px-6"
      >
        <Icon className="size-[30px]" />
        <span className="underline-offset-4 group-hover/link:underline group-data-[active]/link:underline">
          {item.label}
        </span>
      </AppLink>
      {item.menu && (
        <>
          <ExpandButton
            className="h-[52px]"
            open={expanded}
            label={item.label}
            onToggle={() => setExpanded((e) => !e)}
          />
          <NavDropdown expanded={expanded}>
            {item.menu === 'aggregate' ? (
              <AggregateMenuItems />
            ) : (
              MORE_MENU.map((m) => <MoreLink key={m.label} item={m} />)
            )}
          </NavDropdown>
        </>
      )}
    </li>
  )
}

export function TopBar() {
  const { pathname, searchStr } = useLocation()
  const user = useCurrentUser()
  const { theme, toggleTheme } = useTheme()
  const slots = useLayoutSlots()
  // The phone menu is open for the page it was opened on, so going to another page closes it.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname
  const [submitting, setSubmitting] = useState(false)
  const signinFailed = new URLSearchParams(searchStr).get('signin') === 'failed'

  return (
    <header className="relative z-20 bg-linear-to-b from-[rgb(var(--page-rgb)/0.55)] to-[rgb(var(--page-rgb)/0.25)]">
      <div className="mx-auto flex h-[110px] max-w-content items-center justify-center gap-12 px-6 max-[1320px]:h-[72px] max-[1320px]:justify-between max-[1320px]:gap-4 max-[480px]:px-3.5">
        <BrandMenu />

        <nav
          aria-label="Main"
          className={cn(
            'max-[1320px]:absolute max-[1320px]:top-[72px] max-[1320px]:right-0 max-[1320px]:left-0 max-[1320px]:bg-menu max-[1320px]:shadow-[0_12px_30px_rgba(0,0,0,0.45)]',
            !open && 'max-[1320px]:hidden',
          )}
        >
          <ul className="m-0 flex list-none items-center gap-9 p-0 max-[1320px]:flex-col max-[1320px]:items-stretch max-[1320px]:gap-0 max-[1320px]:py-2">
            {NAV.map((item) => (
              <TopNavItem key={item.label} item={item} />
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-5 max-[1320px]:gap-3">
          {user && !user.sample && slots.submitRun && (
            <button
              type="button"
              onClick={() => setSubmitting(true)}
              title="Submit a run"
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[4px] border border-line-strong bg-control px-4 text-lg whitespace-nowrap hover:bg-control-raised"
            >
              <UploadIcon className="size-5" />
              <span className="max-[480px]:hidden">SUBMIT RUN</span>
            </button>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
            title={theme === 'light' ? 'Dark theme' : 'Light theme'}
            className="inline-flex cursor-pointer rounded-full border-0 bg-transparent p-1.5 text-text-2 hover:bg-control-raised hover:text-foreground"
          >
            {theme === 'light' ? (
              <DarkModeIcon className="size-[26px]" />
            ) : (
              <LightModeIcon className="size-[26px]" />
            )}
          </button>
          <ProfileMenu user={user} />
          {isStaff(user) && !user.sample && slots.staffInbox}
          <button
            type="button"
            onClick={() => setOpenOn(open ? null : pathname)}
            aria-expanded={open}
            aria-label="Menu"
            className="order-last hidden cursor-pointer border-0 bg-transparent p-1 max-[1320px]:inline-flex"
          >
            {open ? <CloseIcon className="size-[34px]" /> : <MenuIcon className="size-[34px]" />}
          </button>
        </div>
      </div>
      {signinFailed && (
        <div role="alert" className="mx-auto max-w-content bg-hl-red px-6 py-2 text-center text-hl-red-text">
          Steam sign-in didn’t complete. Please try again.
        </div>
      )}
      {submitting && user && slots.submitRun?.(() => setSubmitting(false))}
    </header>
  )
}
