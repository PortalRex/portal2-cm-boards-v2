import { useLocation } from '@tanstack/react-router'
import { seasonFor, useCatalog } from '@/lib/catalog'

/** The season picked on a page of `base` (?season=), if it's one of that game's seasons. */
export function useSeason(base: string): string | null {
  const catalog = useCatalog()
  const { searchStr } = useLocation()
  return seasonFor(catalog, base, new URLSearchParams(searchStr).get('season'))
}
