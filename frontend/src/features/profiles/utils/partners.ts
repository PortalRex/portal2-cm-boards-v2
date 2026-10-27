import type { Player } from '@/types/runs'
import type { MapScore } from '../types'

/** A co-op partner on the player's personal bests: on how many maps' best they ran together. */
export interface PbPartner {
  player: Player
  maps: number
}

/**
 * The partners on a player's co-op personal bests, those with the most maps first. A best whose
 * partner is unknown (no demo said who) counts for no one.
 */
export function pbPartners(scores: Record<string, MapScore>): PbPartner[] {
  const byPartner = new Map<string, PbPartner>()
  for (const { partner } of Object.values(scores)) {
    const id = partner?.profileNumber
    if (!partner || !id || partner.unknown) continue
    const known = byPartner.get(id)
    if (known) known.maps += 1
    else byPartner.set(id, { player: partner, maps: 1 })
  }
  return [...byPartner.values()].sort((a, b) => b.maps - a.maps || a.player.name.localeCompare(b.player.name))
}
