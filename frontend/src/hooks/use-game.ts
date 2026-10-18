import { useLocation } from '@tanstack/react-router'
import { useCallback, useEffect } from 'react'
import { gameFromLocation, selectedGame, useCatalog } from '@/lib/catalog'
import { STORAGE_KEYS } from '@/lib/storage'
import { setStored, useStored } from './use-stored'

const parse = (raw: string | null) => raw

/** Saves the game picked in the header for the next pages without one in their address. */
export const setGame = (id: string): void => setStored(STORAGE_KEYS.game, id)

/**
 * The selected game's key ("portal2", "mel" or a game's slug). The address wins over the saved
 * choice, and is remembered so the next page without one stays on it.
 */
export function useGame(): string {
  const catalog = useCatalog()
  const { pathname, searchStr } = useLocation()
  const saved = useStored(STORAGE_KEYS.game, parse)
  const fromAddress = gameFromLocation(catalog, pathname, searchStr)
  useEffect(() => {
    if (fromAddress && fromAddress !== saved) setGame(fromAddress)
  }, [fromAddress, saved])
  return selectedGame(catalog, fromAddress, saved)
}

/** [game, pick] for the header's game picker. */
export function useGamePicker(): [string, (id: string) => void] {
  const game = useGame()
  return [game, useCallback((id: string) => setGame(id), [])]
}
