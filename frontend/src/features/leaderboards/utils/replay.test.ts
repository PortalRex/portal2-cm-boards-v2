import { describe, expect, it } from 'vitest'
import type { RankedRun } from '@/types/runs'
import { demosOf, raceReplay, swarmReplay, topReplay, wrReplay } from './replay'

const run = (rank: number, demoId: number | null, demoIds?: [number | null, number | null]): RankedRun => ({
  changelogId: rank,
  rank,
  score: 1000 + rank,
  points: 0,
  timestamp: null,
  youtubeId: null,
  autorenderId: null,
  demoId,
  demoIds,
  note: null,
  portals: null,
  sarVersion: null,
  players: [],
})

describe('board replays', () => {
  const board = [run(1, 10, [11, 10]), run(2, null), run(3, 30), run(4, 40, [null, 40]), run(5, 50)]

  it("takes a run's demos, a co-op run's host first", () => {
    expect(demosOf(board[0]!)).toEqual([11, 10])
    expect(demosOf(board[1]!)).toEqual([])
    expect(demosOf(board[3]!)).toEqual([40])
  })

  it('races the top runs with demos, the best shown with its partner', () => {
    expect(topReplay(board, 3)).toEqual({ open: [11, 10], race: [30, 40] })
    expect(topReplay([run(1, null)], 5)).toBeNull()
  })

  it('races picked runs in board order', () => {
    expect(raceReplay([board[2]!, board[4]!])).toEqual({ open: [30], race: [50] })
  })

  it('swarms the top runs, the best shown', () => {
    expect(swarmReplay(board, 3)).toEqual({ open: [11, 10], swarm: [11, 30, 40] })
  })

  it('races the world records, the newest shown', () => {
    expect(wrReplay([9, 8, 7, 6], 3)).toEqual({ open: [9], race: [8, 7] })
    expect(wrReplay([], 3)).toBeNull()
  })
})
