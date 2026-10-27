import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG, chaptersFor, MEL, PORTAL2 } from '@/lib/catalog'
import type { MapScore } from '../types'
import { gameSlots, gameSummary, toSlots } from './summary'

const pn = '76561198000000001'

describe('gameSlots', () => {
  it("gives Portal 2's three boards, with their roles", () => {
    const slots = gameSlots(BUILTIN_CATALOG, PORTAL2)
    expect(slots.map((s) => [s.key, s.label, s.roleBoard])).toEqual([
      ['sp', 'Singleplayer', 'sp'],
      ['coop', 'Cooperative', 'coop'],
      ['overall', 'Overall', 'overall'],
    ])
    expect(slots[1]!.href(pn)).toBe(`/leaderboard/coop?player=${pn}`)
  })

  it("puts Mel's Story and Advanced boards in the first two slots, without roles", () => {
    const slots = gameSlots(BUILTIN_CATALOG, MEL)
    expect(slots.map((s) => [s.key, s.serverKey, s.label, s.roleBoard])).toEqual([
      ['sp', 'story', 'Story Mode', null],
      ['coop', 'advanced', 'Advanced Mode', null],
      ['overall', 'overall', 'Overall', null],
    ])
    expect(slots[0]!.href(pn)).toBe(`/leaderboard/mel/story?player=${pn}`)
  })
})

describe('gameSummary', () => {
  const [story, advanced] = [
    chaptersFor(BUILTIN_CATALOG, 'story')[0]!,
    chaptersFor(BUILTIN_CATALOG, 'advanced')[0]!,
  ]
  const score = (map: MapScore['map'], rank: number, timestamp: string): MapScore => ({
    map,
    rank,
    score: 5000,
    timestamp,
    points: null,
    deltaNext: null,
    deltaWr: null,
    youtubeId: null,
    changelogId: null,
    autorenderId: null,
    demoId: null,
    note: null,
    partner: null,
  })
  const scores = {
    a: score(story.maps[0]!, 1, '2026-01-01T00:00:00'),
    b: score(story.maps[1]!, 7, '2026-02-01T00:00:00'),
    c: score(advanced.maps[0]!, 3, '2026-03-01T00:00:00'),
  }
  const summary = gameSummary(
    BUILTIN_CATALOG,
    MEL,
    [
      { board: 'story', points: { rank: 4, value: 4305, next: -2, wr: -14 }, time: null },
      { board: 'overall', points: { rank: 6, value: 5505, next: -3, wr: -100 }, time: null },
    ],
    { scores, history: [] },
  )

  it("takes points and places from the game's boards (none where the player isn't on one)", () => {
    expect(summary.points).toEqual({ sp: 4305, coop: 0, overall: 5505 })
    expect(summary.place).toEqual({ sp: 4, coop: null, overall: 6 })
    expect(summary.countryPlace).toBeNull()
  })

  it('works out average places, world records and best and worst places from the best times', () => {
    expect(summary.averagePlace).toEqual({ sp: 4, coop: 3, overall: 11 / 3 })
    expect(summary.worldRecords).toEqual({ sp: 1, coop: 0, overall: 1 })
    expect([summary.best?.rank, summary.worst?.rank]).toEqual([1, 7])
  })
})

describe('toSlots', () => {
  it("moves the server's per-board answers onto the slots", () => {
    expect(toSlots(gameSlots(BUILTIN_CATALOG, MEL), { story: 1, advanced: 2, overall: 3 })).toEqual({
      sp: 1,
      coop: 2,
      overall: 3,
    })
  })
})
