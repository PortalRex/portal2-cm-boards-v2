import { useCallback } from 'react'
import { BACKGROUND_PRESETS, type BackgroundPreset } from '@/components/layouts/backdrops'
import { imageAddress } from '@/lib/image-address'
import { STORAGE_KEYS } from '@/lib/storage'
import { setStored, useStored } from './use-stored'

/** A background chosen for every page: one of the presets, or a picture on Steam or Imgur. */
export type ChosenBackground =
  { kind: 'preset'; preset: BackgroundPreset } | { kind: 'image'; address: string }

// Saved as the preset's id or the picture's address; anything else is the site's own backgrounds.
function parse(raw: string | null): ChosenBackground | null {
  if (!raw) return null
  const preset = BACKGROUND_PRESETS.find((p) => p.id === raw)
  if (preset) return { kind: 'preset', preset }
  const address = imageAddress(raw)
  return address ? { kind: 'image', address } : null
}

/**
 * The background chosen in Settings, which replaces every page's own (null: the site's), and its
 * setter: a preset id, a picture address (checked by the caller) or null.
 */
export function useBackground(): [ChosenBackground | null, (value: string | null) => void] {
  const chosen = useStored(STORAGE_KEYS.background, parse)
  const set = useCallback((value: string | null) => setStored(STORAGE_KEYS.background, value), [])
  return [chosen, set]
}
