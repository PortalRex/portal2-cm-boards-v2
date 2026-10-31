import { useCallback, useEffect } from 'react'
import { STORAGE_KEYS } from '@/lib/storage'
import { setStored, useStored } from './use-stored'

/** High: rank tags filled in deep colours under white numbers (the default). Low: softly tinted. */
export type RankContrast = 'high' | 'low'

const parse = (raw: string | null): RankContrast => (raw === 'low' ? 'low' : 'high')

/** Puts the rank contrast on <html> (data-rank-contrast="low", or nothing); index.css does the rest. */
export function applyRankContrast(contrast: RankContrast): void {
  if (contrast === 'low') document.documentElement.dataset.rankContrast = 'low'
  else delete document.documentElement.dataset.rankContrast
}

/**
 * How rank tags are coloured (Settings), saved as "low" in this browser for low contrast.
 * public/theme.js applies it before React mounts so the page doesn't flash.
 */
export function useRankContrast(): [RankContrast, (contrast: RankContrast) => void] {
  const contrast = useStored(STORAGE_KEYS.rankContrast, parse)
  useEffect(() => applyRankContrast(contrast), [contrast])
  const set = useCallback(
    (next: RankContrast) => setStored(STORAGE_KEYS.rankContrast, next === 'low' ? 'low' : null),
    [],
  )
  return [contrast, set]
}
