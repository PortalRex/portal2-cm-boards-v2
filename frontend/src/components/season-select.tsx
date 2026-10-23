import { useLocation, useNavigate } from '@tanstack/react-router'
import { seasonOptions, seasonsOf, useCatalog, withSeason } from '@/lib/catalog'
import { Select } from './select'

/**
 * All-time or one of `base`'s seasons, kept in the address (?season=) so links and other pages
 * follow it. Nothing for a game without seasons. `onChange(season)` replaces the default (same
 * page, new ?season=).
 */
export function SeasonSelect({
  base,
  season,
  onChange,
  size,
  className,
}: {
  base: string
  season: string | null
  onChange?: (season: string | null) => void
  size?: 'lg' | 'md' | 'xl'
  className?: string
}) {
  const catalog = useCatalog()
  const navigate = useNavigate()
  const { pathname, searchStr } = useLocation()
  if (!seasonsOf(catalog, base).length) return null
  const pick =
    onChange ??
    ((s: string | null) => void navigate({ href: withSeason(pathname + searchStr, s), replace: true }))
  return (
    <Select
      value={season ?? ''}
      onChange={(v) => pick(v || null)}
      options={seasonOptions(catalog, base)}
      label="Season"
      size={size}
      className={className}
    />
  )
}
