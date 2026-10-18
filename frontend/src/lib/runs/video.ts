import { renderRequestUrl, videoLinks, type VideoLinks } from '@/lib/autorender'

/** The parts of a run (score update, board row, profile score) that say where its video is. */
export interface VideoRun {
  id?: number
  changelogId?: number | null
  autorenderId?: string | null
  demoId?: number | null
}

export type RunVideoState = ({ ready: true } & VideoLinks) | { ready: false; render: string | null }

/**
 * A run's video: ready (its own share id, or one autorender reported since), or the address to
 * request a render (only for runs with a demo).
 */
export function runVideo(run: VideoRun, game: string, shareIds?: Map<number, string>): RunVideoState {
  const changelogId = run.changelogId ?? run.id ?? null
  const shareId = run.autorenderId || (changelogId != null ? shareIds?.get(Number(changelogId)) : null)
  if (shareId) return { ready: true, ...videoLinks(shareId) }
  return {
    ready: false,
    render: changelogId != null && run.demoId ? renderRequestUrl(game, changelogId) : null,
  }
}
