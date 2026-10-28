import { afterEach, describe, expect, it, vi } from 'vitest'

/** The module as loaded on a page the browser opened as `type`, at `path`. */
async function loadAs(type: NavigationTimingType, path: string) {
  vi.resetModules()
  window.history.replaceState(null, '', path)
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type } as PerformanceNavigationTiming])
  return import('./reload')
}

describe('takeReload', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.history.replaceState(null, '', '/')
  })

  it('knows the page the browser reloaded, once', async () => {
    const { takeReload } = await loadAs('reload', '/map/sp/47458?at=2021-01-01T00:00:00')
    expect(takeReload('/map/sp/47458')).toBe(true)
    // Back on it later from within the site: not a reload any more.
    expect(takeReload('/map/sp/47458')).toBe(false)
  })

  it('takes a page opened from a link, or another page than the one reloaded, for no reload', async () => {
    expect((await loadAs('navigate', '/map/sp/47458')).takeReload('/map/sp/47458')).toBe(false)
    expect((await loadAs('reload', '/')).takeReload('/map/sp/47458')).toBe(false)
  })
})
