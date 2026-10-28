import { useCallback } from 'react'
import { STORAGE_KEYS } from '@/lib/storage'
import { setStored, useStored } from './use-stored'

// How Score Updates and co-op map boards mark who set a PB with a co-op run: "icon" (a trophy) or
// "border" (the player's name in their colour; the stored value is from when it was an outline).
export type CoopPbStyle = 'icon' | 'border'

export const COOP_PB_STYLES: { value: CoopPbStyle; label: string }[] = [
  { value: 'icon', label: 'Trophy' },
  { value: 'border', label: 'Coloured name' },
]

// Until it's picked in Settings: the trophy, but on phones the coloured name, as a trophy beside
// each name leaves co-op names too little room there.
const PHONE = '(max-width: 700px)'
const defaultStyle = (): CoopPbStyle =>
  typeof window !== 'undefined' && window.matchMedia?.(PHONE).matches ? 'border' : 'icon'

const parseStyle = (raw: string | null): CoopPbStyle =>
  raw === 'border' || raw === 'icon' ? raw : defaultStyle()

export function useCoopPbStyle(): [CoopPbStyle, (style: CoopPbStyle) => void] {
  const style = useStored(STORAGE_KEYS.coopPbStyle, parseStyle)
  const change = useCallback((next: CoopPbStyle) => setStored(STORAGE_KEYS.coopPbStyle, next), [])
  return [style, change]
}
