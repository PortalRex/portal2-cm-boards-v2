import { describe, expect, it } from 'vitest'
import type { Player } from '@/types/runs'
import type { Team } from '../api/stats'
import { playersOnce } from './teams'

const p = (name: string): Player => ({ profileNumber: `id-${name}`, name, avatar: null })
const team = (...names: string[]): Team => ({ players: names.map(p), since: '2024-01-01' })

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
