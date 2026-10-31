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
import { useReadOnly } from '@/hooks/use-read-only'
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
        className="group/link flex h-[110px] items-center gap-3 text-xl font-medium whitespace-nowrap uppercase upto1320:h-[52px] upto1320:px-6"
      >
        <Icon className="size-[26px] stroke-[1.5]" />
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
  const readOnly = useReadOnly()
  const { theme, toggleTheme } = useTheme()
  const slots = useLayoutSlots()
  // The phone menu is open for the page it was opened on, so going to another page closes it.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname
  const [submitting, setSubmitting] = useState(false)
  const signinFailed = new URLSearchParams(searchStr).get('signin') === 'failed'

  return (
    // On iPhones its gradient runs up behind the status bar; the bar itself stays below it.
    <header className="relative z-20 bg-linear-to-b from-[rgb(var(--page-rgb)/0.55)] to-[rgb(var(--page-rgb)/0.25)] pt-[env(safe-area-inset-top,0px)]">
      <div className="mx-auto flex h-[110px] max-w-content items-center justify-center gap-12 px-6 upto1320:h-[72px] upto1320:justify-between upto1320:gap-4 upto480:gap-2 upto480:px-3.5">
        <BrandMenu />

        <nav
          aria-label="Main"
          className={cn(
            'upto1320:absolute upto1320:top-[72px] upto1320:right-0 upto1320:left-0 upto1320:glass-float upto1320:bg-menu upto1320:shadow-[0_12px_30px_rgba(0,0,0,0.45)]',
            !open && 'upto1320:hidden',
          )}
        >
          <ul className="m-0 flex list-none items-center gap-9 p-0 upto1320:flex-col upto1320:items-stretch upto1320:gap-0 upto1320:py-2">
            {NAV.map((item) => (
              <TopNavItem key={item.label} item={item} />
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-5 upto1320:gap-3 upto480:gap-1.5">
          {user && !user.sample && !readOnly.blocked && slots.submitRun && (
            <button
              type="button"
              onClick={() => setSubmitting(true)}
              title="Submit a run"
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[4px] border border-line-strong bg-control px-4 text-lg whitespace-nowrap hover:bg-control-raised upto480:px-2.5"
            >
              <UploadIcon className="size-[18px] stroke-[1.5]" />
              <span className="upto480:hidden">SUBMIT RUN</span>
            </button>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
            title={theme === 'light' ? 'Dark theme' : 'Light theme'}
            className={cn(
              'inline-flex cursor-pointer rounded-full border-0 bg-transparent p-1.5 text-text-2 hover:bg-control-raised hover:text-foreground',
              // Signed in on a phone the bar is full (submit, account, inbox); Settings has the theme.
              user && 'upto480:hidden',
            )}
          >
            {theme === 'light' ? (
              <DarkModeIcon className="size-[22px] stroke-[1.5]" />
            ) : (
              <LightModeIcon className="size-[22px] stroke-[1.5]" />
            )}
          </button>
          <ProfileMenu user={user} />
          {isStaff(user) && slots.staffInbox}
          <button
            type="button"
            onClick={() => setOpenOn(open ? null : pathname)}
            aria-expanded={open}
            aria-label="Menu"
            className="order-last hidden cursor-pointer border-0 bg-transparent p-1 upto1320:inline-flex"
          >
            {open ? (
              <CloseIcon className="size-[30px] stroke-[1.5]" />
            ) : (
              <MenuIcon className="size-[30px] stroke-[1.5]" />
            )}
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
