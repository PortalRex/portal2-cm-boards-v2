import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import type { CSSProperties } from 'react'
import { useIsMe } from '@/hooks/use-is-me'
import type { Player } from '@/types/runs'

/** A player's name, linking to their profile; the signed-in player's own name is highlighted. */
export function PlayerLink({
  player,
  className,
  style,
}: {
  player: Pick<Player, 'profileNumber' | 'name'> | null | undefined
  className?: string
  style?: CSSProperties
}) {
  const mine = useIsMe(player?.profileNumber)
  if (!player) return null
  if (!player.profileNumber) {
    return (
      <span className={className} style={style}>
        {player.name}
      </span>
    )
  }
  return (
    <Link
      to="/profile/$profileId"
      params={{ profileId: player.profileNumber }}
      className={cn('hover:underline', mine && 'font-semibold text-brand-light', className)}
      style={style}
    >
      {player.name}
    </Link>
  )
}
