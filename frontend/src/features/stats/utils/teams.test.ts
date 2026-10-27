import { describe, expect, it } from 'vitest'
import type { Player } from '@/types/runs'
import type { Team } from '../api/stats'
import { firstTeams, playersOnce } from './teams'

const p = (name: string): Player => ({ profileNumber: `id-${name}`, name, avatar: null })
const team = (...names: string[]): Team => ({ players: names.map(p), since: '2024-01-01' })
const at = (since: string | null, ...names: string[]): Team => ({ ...team(...names), since })

describe('playersOnce', () => {
  it('names a player tied with two partners once', () => {
    const teams = [team('RealCreative', 'Jythonscript'), team('unity', 'Jythonscript')]
    expect(playersOnce(teams)).toEqual([
      { players: [p('RealCreative'), p('Jythonscript'), p('unity')], since: '2024-01-01' },
    ])
  })

  it('leaves a single team (and none) as it is', () => {
    expect(playersOnce([team('Zypeh', 'Bexc')])).toEqual([team('Zypeh', 'Bexc')])
    expect(playersOnce([])).toEqual([])
  })
})

describe('firstTeams', () => {
  it('keeps who got the time first, not those who tied it later', () => {
    const lathil = at('2025-05-21T10:00:00', 'Lathil')
    expect(firstTeams([at('2025-06-01T00:00:00', 'unity'), lathil])).toEqual([lathil])
  })

  it('keeps teams that got it at the same moment, and undated teams only when none is dated', () => {
    const [a, b] = [at('2020-02-16T04:36:45', 'Betsruner', 'Bexc'), at('2020-02-16T04:36:45', 'Zypeh')]
    expect(firstTeams([a, b, at(null, 'hero')])).toEqual([a, b])
    expect(firstTeams([at(null, 'hero'), at(null, 'Rex')])).toHaveLength(2)
    expect(firstTeams([])).toEqual([])
  })
})
