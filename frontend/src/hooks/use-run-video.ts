import { isRoleAdmin } from '@/lib/auth'
import { runVideo, type RunVideoState, type VideoRun } from '@/lib/runs/video'
import { useCurrentUser } from './use-current-user'

/**
 * A run's video for this visitor: autorender takes render requests from its admins only (others get
 * "401 Unauthorized" there), so only admins are offered one (not while viewing as a player).
 */
export function useRunVideo(run: VideoRun, game: string, rendered?: Map<number, string>): RunVideoState {
  const admin = isRoleAdmin(useCurrentUser())
  const video = runVideo(run, game, rendered)
  return video.ready || admin ? video : { ready: false, render: null }
}
