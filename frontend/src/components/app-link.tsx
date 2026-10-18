import { useRouter } from '@tanstack/react-router'
import type { AnchorHTMLAttributes, MouseEvent } from 'react'

/**
 * A link to a site path given as a string ("/leaderboard/sp?season=..."), for menus built from
 * data where typed route links don't fit. Navigates in the app; modified clicks open as usual.
 */
export function AppLink({
  href,
  onClick,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const router = useRouter()
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      rest.target
    )
      return
    e.preventDefault()
    void router.navigate({ href })
  }
  return <a href={href} onClick={handle} {...rest} />
}
