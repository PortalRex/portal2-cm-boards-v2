import { useCallback, useEffect } from 'react'
import { STORAGE_KEYS } from '@/lib/storage'
import { setStored, useStored } from './use-stored'

export type Theme = 'dark' | 'light'

// "dark" (the design default) or "light". public/theme.js applies the saved value before React
// mounts so the page doesn't flash.
const parseTheme = (raw: string | null): Theme => (raw === 'light' ? 'light' : 'dark')

/** Puts the theme on <html> (data-theme="light" or nothing) and the browser's theme colour. */
export function applyTheme(theme: Theme): void {
  if (theme === 'light') document.documentElement.dataset.theme = 'light'
  else delete document.documentElement.dataset.theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'light' ? '#e9ebee' : '#1e1f21')
}

export function useTheme() {
  const theme = useStored(STORAGE_KEYS.theme, parseTheme)
  useEffect(() => applyTheme(theme), [theme])
  const setTheme = useCallback((next: Theme) => setStored(STORAGE_KEYS.theme, next), [])
  const toggleTheme = useCallback(
    () => setStored(STORAGE_KEYS.theme, theme === 'light' ? 'dark' : 'light'),
    [theme],
  )
  return { theme, setTheme, toggleTheme }
}
