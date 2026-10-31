import { cn } from 'cn'
import type { ReactNode } from 'react'
import { useBackground } from '@/hooks/use-background'
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

// A background chosen in Settings: in full colour under a light veil, fading out at the bottom on
// iOS (where it's one screen tall, see below).
const CHOSEN =
  'overflow-hidden after:bg-[rgb(var(--page-rgb)/0.3)] ios:after:bg-linear-to-b ios:after:from-transparent ios:after:from-60% ios:after:to-page'

/**
 * A page's frame under the top bar: a full-page background image (tinted, optionally blurred) and
 * a centred content column. A background chosen in Settings replaces the page's own.
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
  const [chosen] = useBackground()
  const own =
    background && SITE_BACKGROUNDS.has(background)
      ? (gameBranding(catalog, game).background ?? background)
      : background
  const image = chosen ? (chosen.kind === 'image' ? chosen.address : null) : own
  return (
    <>
      {/* The background sits at layer 0 and the page above it at layer 1 (a negative z-index under
          a filtered fixed layer let Chromium paint the background over the panels).
          On iOS it isn't fixed: Safari 26 colours its bars from a fixed layer at the screen's edges
          (the mono tint's grey base), so there it scrolls with the page, one screen tall, and the
          bars take the page colour behind it. */}
      <div
        aria-hidden
        data-testid="page-background"
        data-backdrop={chosen?.kind === 'preset' ? chosen.preset.id : undefined}
        className={cn(
          'fixed inset-0 z-0 bg-page bg-cover bg-top after:absolute after:inset-0 after:content-[""] ios:absolute ios:bottom-auto ios:h-lvh',
          chosen
            ? CHOSEN
            : cn('glass-backdrop', TINTS[tint], blur && 'scale-[1.08] blur-[18px] brightness-[0.85]'),
        )}
        style={image ? { backgroundImage: `url("${image}")` } : undefined}
      >
        {/* A preset draws itself under the veil. */}
        {chosen?.kind === 'preset' && <chosen.preset.Scene />}
      </div>
      <main
        className={cn(
          'relative z-[1] mx-auto px-6 pt-4 pb-20 upto700:px-2.5 upto700:pt-2 upto700:pb-[60px]',
          // One or the other: `cn` doesn't know the custom max-w-content, so both would stay.
          narrow ? 'max-w-[1240px]' : 'max-w-content',
        )}
      >
        {children}
      </main>
    </>
  )
}
