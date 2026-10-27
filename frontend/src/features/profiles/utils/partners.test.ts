import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG, chaptersFor } from '@/lib/catalog'
import { coopBests } from '../testing/coop-bests'
import { pbPartners } from './partners'

describe('pbPartners', () => {
  it('counts each partner once per best, the most maps first, and leaves out unknown partners', () => {
    const maps = chaptersFor(BUILTIN_CATALOG, 'coop')[0]!.maps
    const scores = coopBests(maps, ['Bea', 'Ann', 'Bea', null, 'unknown'])
    expect(pbPartners(scores).map((p) => [p.player.name, p.maps])).toEqual([
      ['Bea', 2],
      ['Ann', 1],
    ])
  })
})
