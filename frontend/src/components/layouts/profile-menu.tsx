import { useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from '@tanstack/react-router'
import { cn } from 'cn'
import { useEffect, useRef, useState } from 'react'
import { AppLink } from '@/components/app-link'
import { Avatar } from '@/components/avatar'
import { SteamIcon } from '@/components/icons'
import { isStaff, logout, steamLoginUrl, type CurrentUser } from '@/lib/auth'
import { queryKeys } from '@/lib/query-keys'

const rowClass = (active: boolean) =>
  cn(
    'cursor-pointer border-0 bg-transparent px-[18px] py-1.5 text-left text-[22px] font-normal whitespace-nowrap text-inherit hover:not-disabled:bg-control-raised disabled:cursor-default',
    active && 'shadow-[inset_3px_0_0_var(--brand)]',
  )

/** Phones and tablets: no hovering, so a tap on the picture opens the menu instead. */
const touchOnly = () => window.matchMedia?.('(hover: none)').matches ?? false

/**
 * Sign in through Steam, or the signed-in player's picture with their menu: on hover (a click goes
 * to their profile), or on touch screens by tapping the picture (the menu has My Profile).
 */
export function ProfileMenu({ user }: { user: CurrentUser | null }) {
  const qc = useQueryClient()
  const { pathname, searchStr } = useLocation()
  // Opened on this page; going to another page closes it.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname
  const box = useRef<HTMLDivElement>(null)
  // The menu also shows while something in it has focus (keyboard use), and a tapped link keeps
  // focus after the page changes: let go of it, or the menu would stay over the new page.
  const releaseFocus = () => {
    if (box.current?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
  }
  useEffect(releaseFocus, [pathname])
  useEffect(() => {
    if (!open) return
    const close = () => {
      setOpenOn(null)
      releaseFocus()
    }
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) close()
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])
  if (!user) {
    // Come back to this page, without a failed sign-in's notice.
    const back = pathname + searchStr.replace(/[?&]signin=failed/, '')
    return (
      <a
        href={steamLoginUrl(back)}
        title="Sign in through Steam"
        className="inline-flex h-10 items-center gap-2 rounded-[4px] border border-line-strong bg-control px-[18px] text-lg whitespace-nowrap hover:border-text-muted upto480:px-2.5"
      >
        <SteamIcon size={20} /> <span className="upto480:hidden">Sign in</span>
      </a>
    )
  }
  const profile = `/profile/${user.profileNumber}`
  // Like legacy: the user is forgotten on this page even if the request fails.
  const signOut = () => {
    setOpenOn(null)
    releaseFocus()
    return logout(qc).catch(() => qc.setQueryData(queryKeys.me(), null))
  }
  return (
    <div ref={box} className="group/profile relative">
      <Link
        to="/profile/$profileId"
        params={{ profileId: user.profileNumber }}
        aria-label="Your profile"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          if (!touchOnly()) return
          e.preventDefault()
          if (open) releaseFocus()
          setOpenOn(open ? null : pathname)
        }}
      >
        <Avatar src={user.avatar} name={user.name} size={48} className="rounded-lg upto1320:size-10!" />
      </Link>
      <div
        role="menu"
        className={cn(
          'glass-float invisible absolute top-[60px] right-0 z-50 flex w-[250px] max-w-[calc(100vw-24px)] flex-col items-stretch overflow-hidden rounded-lg bg-menu pb-3.5 opacity-0 shadow-[0_12px_30px_rgba(0,0,0,0.45)] transition-[opacity,visibility] duration-100 group-hover/profile:visible group-hover/profile:opacity-100 group-has-[:focus-visible]/profile:visible group-has-[:focus-visible]/profile:opacity-100 upto1320:top-[52px]',
          open && 'visible opacity-100',
        )}
      >
        <Link
          to="/profile/$profileId"
          params={{ profileId: user.profileNumber }}
          className="group/banner relative mb-2 flex h-[125px] items-end overflow-hidden bg-[#2a2d33]"
        >
          {/* The avatar, blurred and darkened; it overhangs the banner, which clips it. */}
          <span
            aria-hidden
            className="absolute -inset-2 bg-cover bg-center bg-no-repeat brightness-[0.55] blur-[2px] transition-[filter] group-hover/banner:brightness-[0.7]"
            style={user.avatar ? { backgroundImage: `url("${user.avatar}")` } : undefined}
          />
          <span className="relative min-w-0 flex-1 truncate px-[18px] pb-2.5 text-left text-xl font-normal text-white [text-shadow:0_1px_3px_rgb(0_0_0/60%)]">
            {user.name}
          </span>
        </Link>
        <Link
          to="/profile/$profileId"
          params={{ profileId: user.profileNumber }}
          className={rowClass(pathname === profile)}
        >
          My Profile
        </Link>
        <AppLink href="/more/settings" className={rowClass(pathname === '/more/settings')}>
          Settings
        </AppLink>
        {isStaff(user) && (
          <AppLink href="/admin" className={rowClass(pathname === '/admin')}>
            Staff
          </AppLink>
        )}
        <button
          type="button"
          onClick={signOut}
          disabled={user.sample}
          title={user.sample ? 'Sample data: not signed in' : undefined}
          className={rowClass(false)}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
