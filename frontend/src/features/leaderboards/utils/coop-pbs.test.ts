import { describe, expect, it } from 'vitest'
import type { Player, RankedRun } from '@/types/runs'
import { nonPbPlayers } from './coop-pbs'

const player = (profileNumber: string | null): Player => ({
  profileNumber,
  name: profileNumber ?? '?',
  avatar: null,
})
const run = (score: number, ...ids: (string | null)[]): RankedRun =>
  ({ score, rank: 0, players: ids.map(player) }) as RankedRun

describe('nonPbPlayers', () => {
  it('marks a player on every run except their fastest', () => {
    const best = run(733, 'a', 'b')
    const slower = run(736, 'c', 'a')
    const result = nonPbPlayers([slower, best])
    expect(result.get(slower)).toEqual(new Set(['a']))
    expect(result.has(best)).toBe(false)
  })

  it('gives a tie to the earlier run on the board', () => {
    const first = run(800, 'a', 'b')
    const second = run(800, 'a', 'c')
    const result = nonPbPlayers([first, second])
    expect(result.has(first)).toBe(false)
    expect(result.get(second)).toEqual(new Set(['a']))
  })

  it('ignores players without a profile', () => {
    expect(nonPbPlayers([run(700, 'a', null), run(710, 'b', null)]).size).toBe(0)
  })
})
