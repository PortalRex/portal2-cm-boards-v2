import { describe, expect, it } from 'vitest'
import type { Chapter, MapInfo } from '@/lib/catalog'
import { compareSummary } from './summary'

const map = (id: string) => ({ id }) as MapInfo
const chapters = [{ maps: [map('1'), map('2'), map('3')] }, { maps: [map('4'), map('5')] }] as Chapter[]

describe('compareSummary', () => {
  it('counts maps each player is faster on, a time beating no time', () => {
    const left = {
      '1': { score: 100, rank: 1 },
      '2': { score: 200, rank: 3 },
      '3': { score: 50, rank: 2 },
      '4': { score: 9, rank: 9 },
    }
    const right = {
      '1': { score: 120, rank: 2 },
      '2': { score: 150, rank: 1 },
      '3': { score: 50, rank: 2 },
      '5': { score: 7, rank: 5 },
    }
    expect(compareSummary(chapters, left, right)).toEqual({
      left: 2,
      right: 2,
      ties: 1,
      onlyLeft: 1,
      onlyRight: 1,
      leftTotal: 350,
      rightTotal: 320,
      shared: 3,
    })
  })

  it('leaves out maps neither has a time on, and maps off the board', () => {
    expect(compareSummary(chapters, { '99': { score: 1, rank: 1 } }, {})).toMatchObject({
      left: 0,
      right: 0,
      shared: 0,
    })
  })
})
