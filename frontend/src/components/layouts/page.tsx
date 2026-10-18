import { cn } from 'cn'
import type { ReactNode } from 'react'
import { useGame } from '@/hooks/use-game'
import { gameBranding, useCatalog } from '@/lib/catalog'
import { boardsBackground, siteBackground } from './backgrounds'

// The site-wide backgrounds, replaced by the game's own when it has one (a map's picture or a
// player's avatar stays).
const SITE_BACKGROUNDS = new Set([siteBackground, boardsBackground])

const TINTS = {
  dark: 'after:bg-linear-to-b after:from-[rgb(var(--page-rgb)/0.35)] after:via-[rgb(var(--page-rgb)/0.8)] after:via-55% after:to-page',
  // Greyscale without a CSS filter: the image's luminosity blended onto grey stays part of the
  // background's own paint rather than a separately composited layer.
  mono: 'bg-[#808080] bg-blend-luminosity after:bg-linear-to-b after:from-[rgb(var(--page-rgb)/0.25)] after:via-[rgb(var(--page-rgb)/0.85)] after:via-60% after:to-page',
  warm: 'after:bg-linear-to-b after:from-[rgba(20,14,6,0.2)] after:via-[rgb(var(--page-rgb)/0.85)] after:via-75% after:to-page',
}

/**
 * A page's frame under the top bar: a full-page background image (tinted, optionally blurred) and
 * a centred content column.
 */
export function Page({
  background,
  blur = false,
  tint = 'dark',
  narrow = false,
  children,
}: {
  background?: string | null
  blur?: boolean
  tint?: keyof typeof TINTS
  narrow?: boolean
  children: ReactNode
}) {
  const catalog = useCatalog()
  const game = useGame()
  const image =
    background && SITE_BACKGROUNDS.has(background)
      ? (gameBranding(catalog, game).background ?? background)
      : background
  return (
    <>
      {/* The background sits at layer 0 and the page above it at layer 1 (a negative z-index under
          a filtered fixed layer let Chromium paint the background over the panels). */}
      <div
        aria-hidden
        data-testid="page-background"
        className={cn(
          'fixed inset-0 z-0 bg-page bg-cover bg-top after:absolute after:inset-0 after:content-[""]',
          TINTS[tint],
          blur && 'scale-[1.08] blur-[18px] brightness-[0.85]',
        )}
        style={image ? { backgroundImage: `url("${image}")` } : undefined}
      />
      <main
        className={cn(
          'relative z-[1] mx-auto max-w-content px-6 pt-4 pb-20 max-[700px]:px-2.5 max-[700px]:pt-2 max-[700px]:pb-[60px]',
          narrow && 'max-w-[1240px]',
        )}
      >
        {children}
      </main>
    </>
  )
}
