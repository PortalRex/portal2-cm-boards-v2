// Per-browser settings in localStorage. The keys and value formats are the legacy site's, so
// people keep their settings across the switch:
//   p2cm.game          selected game id
//   p2cm.theme         "light" | "dark"
//   p2cm.viewAsPlayer  "1" when on (otherwise absent)
//   p2cm.coopPbStyle   "icon" | "border"
//   p2cm.collapsed     JSON array of collapsed card ids
//   p2cm.follows       JSON array of { profileNumber, name, avatar }
// and the new site's own:
//   p2cm.glass         "1" when the liquid glass look is on (otherwise absent)
//
// Every access is wrapped: storage can be blocked (private windows, strict settings). A value
// that couldn't be stored is kept in memory instead, so the choice lasts for this page view.

export const STORAGE_KEYS = {
  game: 'p2cm.game',
  theme: 'p2cm.theme',
  viewAsPlayer: 'p2cm.viewAsPlayer',
  coopPbStyle: 'p2cm.coopPbStyle',
  collapsed: 'p2cm.collapsed',
  follows: 'p2cm.follows',
  glass: 'p2cm.glass',
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

/** Fired on window when this page changes a setting (other tabs get the `storage` event). */
export const STORAGE_EVENT = 'p2cm:storage'

const unsaved = new Map<string, string | null>()

export function readStorage(key: string): string | null {
  if (unsaved.has(key)) return unsaved.get(key) ?? null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Stores `value` (or removes the key for null) and tells this page's readers. */
export function writeStorage(key: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
    unsaved.delete(key)
  } catch {
    unsaved.set(key, value)
  }
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT, { detail: key }))
}

/** Calls `onChange` when `key` changes in this page or another tab. */
export function subscribeStorage(key: string, onChange: () => void): () => void {
  const local = (e: Event) => {
    if ((e as CustomEvent<string>).detail === key) onChange()
  }
  const other = (e: StorageEvent) => {
    if (e.key === key || e.key === null) onChange()
  }
  window.addEventListener(STORAGE_EVENT, local)
  window.addEventListener('storage', other)
  return () => {
    window.removeEventListener(STORAGE_EVENT, local)
    window.removeEventListener('storage', other)
  }
}

/** Reads a JSON value, or `fallback` when it's missing or unreadable. */
export function readJson<T>(key: string, fallback: T): T {
  const raw = readStorage(key)
  if (raw == null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** For tests: forgets the in-memory values kept while storage was blocked. */
export function resetUnsavedStorage(): void {
  unsaved.clear()
}
