import { useCallback } from 'react'
import { STORAGE_KEYS } from '@/lib/storage'
import { setStored, useStored } from './use-stored'

// How Score Updates and co-op map boards mark who set a PB with a co-op run: "icon" (a trophy, the default) or
// "border" (the player's name in their colour; the stored value is from when it was an outline).
export type CoopPbStyle = 'icon' | 'border'

export const COOP_PB_STYLES: { value: CoopPbStyle; label: string }[] = [
  { value: 'icon', label: 'Trophy' },
  { value: 'border', label: 'Coloured name' },
]

const parseStyle = (raw: string | null): CoopPbStyle => (raw === 'border' ? 'border' : 'icon')

export function useCoopPbStyle(): [CoopPbStyle, (style: CoopPbStyle) => void] {
  const style = useStored(STORAGE_KEYS.coopPbStyle, parseStyle)
  const change = useCallback((next: CoopPbStyle) => setStored(STORAGE_KEYS.coopPbStyle, next), [])
  return [style, change]
}
