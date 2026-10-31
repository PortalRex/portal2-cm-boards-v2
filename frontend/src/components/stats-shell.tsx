import { Link, useLocation } from '@tanstack/react-router'
import { useEffect, useRef, type ReactNode } from 'react'
import { siteBackground } from './layouts/backgrounds'
import { Page } from './layouts/page'

const TABS = [
  { to: '/stats', label: 'Runners' },
  { to: '/stats/records', label: 'Records' },
  { to: '/stats/history', label: 'History' },
  { to: '/stats/race', label: 'Race' },
  { to: '/stats/compare', label: 'Compare' },
  { to: '/stats/countries', label: 'Countries' },
] as const

const tab =
  'flex h-[46px] min-w-[124px] flex-none items-center justify-center rounded-t-[10px] bg-control-raised px-7 text-lg font-light text-text-2 uppercase no-underline upto900:min-w-0 upto900:px-4 upto900:text-base'

/**
 * The Stats section: its tabs (Runners, the world record pages, Compare and Countries) above the
 * page's panel, which joins them (pass the panel `className="rounded-tl-none"`).
 */
export function StatsShell({ children }: { children: ReactNode }) {
  const nav = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  // On a phone the tabs scroll sideways: bring this page's into view (centred).
  useEffect(() => {
    const strip = nav.current
    const current = strip?.querySelector<HTMLElement>('[aria-current=page]')
    if (strip && current)
      strip.scrollLeft = current.offsetLeft - (strip.clientWidth - current.offsetWidth) / 2
  }, [pathname])
  return (
    <Page background={siteBackground} tint="mono">
      <nav ref={nav} aria-label="Stats pages" className="relative flex gap-1.5 overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            activeOptions={{ exact: true, includeSearch: false }}
            className={tab}
            activeProps={{
              className: 'bg-panel-body! text-foreground!',
              'aria-current': 'page',
            }}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </Page>
  )
}
