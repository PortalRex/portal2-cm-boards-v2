import { cn } from 'cn'
import { StarIcon } from '@/components/icons'
import { roundButton } from '@/components/round-button'
import { useFollows } from '@/hooks/use-follows'
import type { ProfilePlayer } from '../types'

/** Follow this player's runs on Score Updates (saved in this browser). */
export function FollowButton({ player }: { player: ProfilePlayer }) {
  const { isFollowing, toggleFollow } = useFollows()
  const following = isFollowing(player.profileNumber)
  return (
    <button
      type="button"
      className={cn(
        roundButton,
        following && 'border-brand bg-brand text-white hover:border-brand hover:text-white',
      )}
      onClick={() => toggleFollow(player)}
      aria-pressed={following}
      aria-label="Follow"
      title={
        following
          ? 'Following: click to stop (saved in this browser)'
          : "Follow this player's runs on Score Updates (saved in this browser)"
      }
    >
      <StarIcon fill={following ? 'currentColor' : 'none'} />
    </button>
  )
}
