import { useCallback } from 'react'
import { STORAGE_KEYS } from '@/lib/storage'
import { setStored, useStored } from './use-stored'

/** The Portal 2 tab profiles open on (Settings): Singleplayer by default. */
export type ProfileTab = 'sp' | 'coop' | 'legacy'

export const PROFILE_TABS: { value: ProfileTab; label: string }[] = [
  { value: 'sp', label: 'Singleplayer' },
  { value: 'coop', label: 'Cooperative' },
  { value: 'legacy', label: 'Legacy' },
]

const parse = (raw: string | null): ProfileTab => (raw === 'coop' || raw === 'legacy' ? raw : 'sp')

/** [tab, set]: saved in this browser (absent for Singleplayer). */
export function useProfileTab(): [ProfileTab, (tab: ProfileTab) => void] {
  const tab = useStored(STORAGE_KEYS.profileTab, parse)
  const set = useCallback(
    (next: ProfileTab) => setStored(STORAGE_KEYS.profileTab, next === 'sp' ? null : next),
    [],
  )
  return [tab, set]
}
