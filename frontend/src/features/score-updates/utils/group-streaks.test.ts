import { describe, expect, it } from 'vitest'
import type { ScoreUpdate } from './merge-coop-halves'
import { groupStreaks, streakSummary } from './group-streaks'

const map = { id: '47458', title: 'Portal Gun', mode: 'sp', game: 'portal2', chapter: 'The Courtesy Call' }
const player = (name: string) => ({ profileNumber: `7656119800000${name.length}${name}`, name, avatar: null })

let nextId = 1
/** A PB by `who` at `time` (2026-10-28, UTC) on `on`. */
const pb = (who: string, time: string, over: Partial<ScoreUpdate> = {}): ScoreUpdate => ({
  id: nextId++,
  game: 'portal2',
  timestamp: `2026-10-28T${time}:00`,
  map,
  score: 2300,
  preRank: 10,
  postRank: 8,
  scoreDelta: -20,
  pointsDelta: 5,
  players: [player(who)],
  submitter: player(who).profileNumber,
  youtubeId: null,
  autorenderId: null,
  demoId: null,
  portals: null,
  note: null,
  verified: true,
  banned: false,
  coopId: null,
  rolesKnown: null,
  sarVersion: null,
  dateEstimated: false,
  pbs: null,
  ...over,
})

describe('groupStreaks', () => {
  it("folds a player's PBs on a map into the newest, past other players' updates", () => {
    const [a3, b, a2, a1] = [pb('ann', '15:00'), pb('bob', '14:30'), pb('ann', '14:00'), pb('ann', '12:30')]
    const rows = groupStreaks([a3!, b!, a2!, a1!])
    expect(rows.map((r) => [r.id, r.earlier.map((e) => e.id)])).toEqual([
      [a3!.id, [a2!.id, a1!.id]],
      [b!.id, []],
    ])
  })

  it('starts a new session after a gap of over three hours, or on another map', () => {
    const late = pb('ann', '20:00')
    const other = pb('ann', '19:30', { map: { ...map, id: '47817', title: 'Propulsion Catch' } })
    const early = pb('ann', '16:00')
    const rows = groupStreaks([late, other, early])
    expect(rows.map((r) => r.earlier.length)).toEqual([0, 0, 0])
  })

  it('leaves banned runs on their own', () => {
    const rows = groupStreaks([pb('ann', '15:00'), pb('ann', '14:00', { banned: true }), pb('ann', '13:00')])
    expect(rows.map((r) => r.earlier.length)).toEqual([1, 0])
    expect(rows[1]!.banned).toBe(true)
  })
})

describe('streakSummary', () => {
  it('runs from the rank before the first PB, adding up what all of them gained', () => {
    const [row] = groupStreaks([
      pb('ann', '15:00', { preRank: 5, postRank: 1, scoreDelta: -30, pointsDelta: 20 }),
      pb('ann', '14:00', { preRank: 9, postRank: 5, scoreDelta: -12, pointsDelta: null }),
      pb('ann', '13:00', { preRank: 40, postRank: 9, scoreDelta: null, pointsDelta: 30 }),
    ])
    expect(streakSummary(row!)).toEqual({ preRank: 40, scoreDelta: -42, pointsDelta: 50 })
  })
})
