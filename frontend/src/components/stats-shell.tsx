import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
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
  'flex h-[46px] min-w-[124px] flex-none items-center justify-center rounded-t-[10px] bg-control-raised px-7 text-lg font-light text-text-2 uppercase no-underline max-[900px]:min-w-0 max-[900px]:px-4 max-[900px]:text-base'

/**
 * The Stats section: its tabs (Runners, the world record pages, Compare and Countries) above the
 * page's panel, which joins them (pass the panel `className="rounded-tl-none"`).
 */
export function StatsShell({ children }: { children: ReactNode }) {
  return (
    <Page background={siteBackground} tint="mono">
      <nav aria-label="Stats pages" className="flex gap-1.5 overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            activeOptions={{ exact: true, includeSearch: false }}
            className={tab}
            activeProps={{
              className: 'bg-[rgb(var(--panel-rgb)/0.97)]! text-foreground!',
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
