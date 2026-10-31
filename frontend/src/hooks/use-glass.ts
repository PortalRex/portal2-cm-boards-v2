import { useCallback, useEffect } from 'react'
import { STORAGE_KEYS } from '@/lib/storage'
import { setStored, useStored } from './use-stored'

const parse = (raw: string | null) => raw === '1'

/** Puts the liquid glass look on <html> (data-glass="on", or nothing); index.css does the rest. */
export function applyGlass(on: boolean): void {
  if (on) document.documentElement.dataset.glass = 'on'
  else delete document.documentElement.dataset.glass
}

/** The liquid glass look (Settings), on top of the dark or light theme; saved as "1" in this browser.
 *  public/theme.js applies it before React mounts so the page doesn't flash. */
export function useGlass(): [boolean, (on: boolean) => void] {
  const on = useStored(STORAGE_KEYS.glass, parse)
  useEffect(() => applyGlass(on), [on])
  const set = useCallback((next: boolean) => setStored(STORAGE_KEYS.glass, next ? '1' : null), [])
  return [on, set]
}
