import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { readStorage, subscribeStorage, writeStorage } from '@/lib/storage'

/**
 * A localStorage setting as React state, shared by every component and tab that uses `key`.
 * `parse` turns the stored text (null when unset) into the value; it must return equal values for
 * equal text, so results are memoised on the text.
 */
export function useStored<T>(key: string, parse: (raw: string | null) => T): T {
  const subscribe = useCallback((onChange: () => void) => subscribeStorage(key, onChange), [key])
  const raw = useSyncExternalStore(subscribe, () => readStorage(key))
  return useMemo(() => parse(raw), [parse, raw])
}

export const setStored = writeStorage
