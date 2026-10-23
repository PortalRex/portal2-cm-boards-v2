import { env } from '@/config/env'

// Autorender (github.com/p2sr/autorender): rendered videos of board runs. Its API allows
// cross-origin requests, so these go straight to it (VITE_AUTORENDER_URL), not through our API.

// BoardSource enum in autorender src/shared/models.ts.
const BOARD_SOURCE: Record<string, number> = { portal2: 1, mel: 2 }
const TICKS_PER_SECOND = 60

export const renderRequestUrl = (game: string, changelogId: number | string) =>
  `${env.VITE_AUTORENDER_URL}/render/${game === 'mel' ? 'mel' : 'portal2'}/${changelogId}`

export interface VideoLinks {
  src: string
  sources: string[]
  page: string
}

/**
 * Playback and page links for a rendered video, from its share id. Videos rendered before July
 * 2026 sit in object storage as {share_id}.mp4; newer ones are served by autorender itself.
 * Neither URL works for the other kind, so players get both, in that order.
 */
export function videoLinks(shareId: string): VideoLinks {
  const sources = [
    `${env.VITE_AUTORENDER_STORAGE_URL}/${shareId}.mp4`,
    `${env.VITE_AUTORENDER_URL}/storage/videos/${shareId}`,
  ]
  return { src: sources[0]!, sources, page: `${env.VITE_AUTORENDER_URL}/videos/${shareId}` }
}

// Autorender only offers an existence check for Portal 2; /video/{id}/video then redirects to
// /storage/videos/{share_id}, which gives the share id.
async function resolveShareId(game: string, changelogId: number): Promise<string | null> {
  const res = await fetch(
    `${env.VITE_AUTORENDER_URL}/api/v1/video/${changelogId}/video?source=${BOARD_SOURCE[game]}`,
    { method: 'HEAD' },
  )
  const match = res.url.match(/\/videos\/([\w-]{11})(?:$|[?#])/)
  return match?.[1] ?? null
}

/**
 * Share ids of rendered Portal 2 runs, by changelog id (runs without a video are left out). Mel
 * runs carry their share id already (changelog.autorender_id).
 */
export async function fetchShareIds(changelogIds: number[], game = 'portal2'): Promise<Map<number, string>> {
  const ids = [...new Set(changelogIds.map(Number))]
  if (!ids.length || game !== 'portal2') return new Map()
  const res = await fetch(`${env.VITE_AUTORENDER_URL}/api/v1/check-videos-exist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) throw new Error(`autorender ${res.status}`)
  const { ids: found } = (await res.json()) as { ids: number[] }
  const pairs = await Promise.all(
    found.map(async (id) => [id, await resolveShareId(game, id).catch(() => null)] as const),
  )
  return new Map(pairs.filter((p): p is readonly [number, string] => p[1] != null))
}

export interface Segment {
  name: string
  ticks: number
  splits?: { name: string; ticks: number }[]
}

export interface FormattedSegment {
  name: string
  ticks: number
  seconds: number
  totalTicks: number
  total: number
  splits: { name: string; ticks: number }[]
}

const stripMapPrefix = (name: string, mapTitle: string) => {
  const prefix = `${mapTitle} - `
  return name.startsWith(prefix) ? name.slice(prefix.length) : name
}

/** Display rows for a run's mtrigger segments (as stored on the changelog). */
export function formatSegments(
  segments: Segment[] | null | undefined,
  mapTitle: string,
): FormattedSegment[] | null {
  if (!segments?.length) return null
  let totalTicks = 0
  return segments.map((s) => {
    totalTicks += s.ticks
    return {
      name: stripMapPrefix(s.name, mapTitle),
      ticks: s.ticks,
      seconds: s.ticks / TICKS_PER_SECOND,
      totalTicks,
      total: totalTicks / TICKS_PER_SECOND,
      splits:
        s.splits && s.splits.length > 1
          ? s.splits.map((sp) => ({ name: stripMapPrefix(sp.name, mapTitle), ticks: sp.ticks }))
          : [],
    }
  })
}
