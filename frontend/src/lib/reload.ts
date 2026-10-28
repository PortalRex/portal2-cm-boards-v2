/** The path the browser reloaded this page at (null: it was opened, not reloaded), until taken. */
let reloadedPath: string | null = readReload()

function readReload(): string | null {
  if (typeof window === 'undefined' || typeof performance?.getEntriesByType !== 'function') return null
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  return nav?.type === 'reload' ? window.location.pathname : null
}

/**
 * Whether the page at `pathname` is the one the browser just reloaded. True once at most: after
 * that (and for any other page) it's a page opened from a link or moved to within the site.
 */
export function takeReload(pathname: string): boolean {
  const reloaded = reloadedPath === pathname
  reloadedPath = null
  return reloaded
}
