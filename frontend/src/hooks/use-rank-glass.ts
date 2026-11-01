import { useCallback, useEffect } from 'react'
import { STORAGE_KEYS } from '@/lib/storage'
import { setStored, useStored } from './use-stored'

/** Rank: the glass behind a map's name takes the run's new rank colour (the default). Plain: untinted. */
export type RankGlass = 'rank' | 'plain'

const parse = (raw: string | null): RankGlass => (raw === 'plain' ? 'plain' : 'rank')

/** Puts plain map name glass on <html> (data-rank-glass="plain", or nothing); index.css does the rest. */
export function applyRankGlass(glass: RankGlass): void {
  if (glass === 'plain') document.documentElement.dataset.rankGlass = 'plain'
  else delete document.documentElement.dataset.rankGlass
}

/**
 * How the glass behind map names (Score Updates) is tinted (Settings), saved as "plain" in this
 * browser for untinted glass. public/theme.js applies it before React mounts so the page doesn't flash.
 */
export function useRankGlass(): [RankGlass, (glass: RankGlass) => void] {
  const glass = useStored(STORAGE_KEYS.rankGlass, parse)
  useEffect(() => applyRankGlass(glass), [glass])
  const set = useCallback(
    (next: RankGlass) => setStored(STORAGE_KEYS.rankGlass, next === 'plain' ? 'plain' : null),
    [],
  )
  return [glass, set]
}
