import { useCallback } from 'react'
import { STORAGE_KEYS } from '@/lib/storage'
import { setStored, useStored } from './use-stored'

/** A followed player, as stored in this browser (follows live here until accounts have them). */
export interface FollowedPlayer {
  profileNumber: string
  name: string
  avatar: string | null
}

const parseFollows = (raw: string | null): FollowedPlayer[] => {
  try {
    const list: unknown = JSON.parse(raw ?? '[]')
    return Array.isArray(list)
      ? list.filter((p): p is FollowedPlayer => Boolean(p && typeof p === 'object' && p.profileNumber))
      : []
  } catch {
    return []
  }
}

export function useFollows() {
  const follows = useStored(STORAGE_KEYS.follows, parseFollows)

  const isFollowing = useCallback(
    (profileNumber: string | null | undefined) => follows.some((p) => p.profileNumber === profileNumber),
    [follows],
  )

  const toggleFollow = useCallback(
    (player: { profileNumber: string; name: string; avatar?: string | null }) => {
      const next = isFollowing(player.profileNumber)
        ? follows.filter((p) => p.profileNumber !== player.profileNumber)
        : [
            ...follows,
            { profileNumber: player.profileNumber, name: player.name, avatar: player.avatar ?? null },
          ]
      setStored(STORAGE_KEYS.follows, JSON.stringify(next))
    },
    [follows, isFollowing],
  )

  return { follows, isFollowing, toggleFollow }
}
