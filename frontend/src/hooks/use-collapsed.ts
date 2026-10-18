import { useCallback } from 'react'
import { readJson, STORAGE_KEYS } from '@/lib/storage'
import { setStored, useStored } from './use-stored'

// Which cards the viewer has collapsed, remembered in this browser (shared by every page and tab).
const parseSet = (raw: string | null): ReadonlySet<string> => {
  try {
    const list: unknown = JSON.parse(raw ?? '[]')
    return new Set(Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

const update = (change: (set: Set<string>) => void) => {
  const set = new Set(readJson<string[]>(STORAGE_KEYS.collapsed, []))
  change(set)
  setStored(STORAGE_KEYS.collapsed, JSON.stringify([...set]))
}

/** [collapsed, toggle] for the card named `id`; without an id the card can't collapse. */
export function useCollapsed(id: string | null | undefined): [boolean, () => void] {
  const set = useStored(STORAGE_KEYS.collapsed, parseSet)
  const toggle = useCallback(() => {
    if (!id) return
    update((s) => (s.has(id) ? s.delete(id) : s.add(id)))
  }, [id])
  return [id ? set.has(id) : false, toggle]
}

/**
 * [allCollapsed, toggleAll] for a group of cards: collapses them all, or opens them all when
 * they're all collapsed already.
 */
export function useCollapsedGroup(ids: string[]): [boolean, () => void] {
  const set = useStored(STORAGE_KEYS.collapsed, parseSet)
  const all = ids.every((id) => set.has(id))
  const key = ids.join('|')
  const toggleAll = useCallback(() => {
    const list = key.split('|')
    update((s) => list.forEach((id) => (all ? s.delete(id) : s.add(id))))
  }, [key, all])
  return [all, toggleAll]
}
