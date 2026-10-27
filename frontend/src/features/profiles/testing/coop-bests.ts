import type { MapInfo } from '@/lib/catalog'
import type { MapScore } from '../types'

/**
 * A player's co-op bests, one per map, each with the partner named (a made-up Steam id from the
 * name), none, or an unknown one ('unknown': an unpaired run's filler partner).
 */
export function coopBests(maps: MapInfo[], partners: (string | null)[]): Record<string, MapScore> {
  const scores: Record<string, MapScore> = {}
  partners.forEach((name, i) => {
    const map = maps[i]!
    scores[map.id] = {
      map,
      rank: 5,
      score: 1500,
      timestamp: '2026-01-01T00:00:00',
      points: 196,
      deltaNext: 1,
      deltaWr: 10,
      youtubeId: null,
      changelogId: null,
      autorenderId: null,
      demoId: null,
      note: null,
      partner:
        name === 'unknown'
          ? { profileNumber: null, name: 'Unknown', avatar: null, unknown: true }
          : name
            ? { profileNumber: `7656119800000${name.length}${name.charCodeAt(0)}`, name, avatar: null }
            : null,
    }
  })
  return scores
}
