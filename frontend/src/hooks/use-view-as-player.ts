import { useCallback } from 'react'
import { readStorage, STORAGE_KEYS } from '@/lib/storage'
import { setStored, useStored } from './use-stored'

const parse = (raw: string | null) => raw === '1'

/** Whether staff chose to view the site as a player (Settings), saved as "1" in this browser. */
export const readViewAsPlayer = (): boolean => parse(readStorage(STORAGE_KEYS.viewAsPlayer))

export function useViewAsPlayer(): [boolean, (on: boolean) => void] {
  const on = useStored(STORAGE_KEYS.viewAsPlayer, parse)
  const set = useCallback((next: boolean) => setStored(STORAGE_KEYS.viewAsPlayer, next ? '1' : null), [])
  return [on, set]
}
