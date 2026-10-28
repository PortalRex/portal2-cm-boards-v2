import { describe, expect, it } from 'vitest'
import {
  historyChartData,
  nearestPoint,
  PLAYER_COLORS,
  playerColors,
  scoreTicks,
  standingRecord,
  stepRecord,
  toSecond,
  type HistoryPoint,
} from './history'

const record = (t: number, score: number, player: string, gain: number | null): HistoryPoint => ({
  t,
  score,
  player,
  gain,
})
// Three records: day 10, day 500 and day 501 (the latest, a day after the one before).
const records = [record(10, 1530, 'a', null), record(500, 1503, 'b', 27), record(501, 1475, 'c', 28)]

describe('historyChartData', () => {
  it('carries each record along its flat line to just before the next, the latest on to today', () => {
    const data = historyChartData(records, 0, 1000, 1000)
    expect(data.map((d) => [d.t, d.player])).toEqual([
      [10, 'a'],
      [495.05, 'a'],
      [500, 'b'],
      [501, 'c'],
      [1000, 'c'],
    ])
    // Hovering late in a's long stretch lands on this copy: still a's record, set on day 10.
    expect(data[1]).toMatchObject({ score: 1530, carried: true, setAt: 10 })
    // The end is today: c's record with its own day and gain.
    expect(data[4]).toMatchObject({
      score: 1475,
      player: 'c',
      gain: 28,
      setAt: 501,
      now: true,
      carried: false,
    })
  })

  it('carries the record standing at the start of a zoomed view in, with the day it was set', () => {
    const data = historyChartData(records, 300, 500, 1000)
    expect(data.map((d) => [d.t, d.player])).toEqual([
      [300, 'a'],
      [499, 'a'],
      [500, 'b'],
    ])
    expect(data[0]).toMatchObject({ carried: true, setAt: 10 })
    expect(data[1]).toMatchObject({ carried: true, setAt: 10 })
  })
})

describe('nearestPoint', () => {
  it('finds the point nearest a moment, the earlier of two as near', () => {
    expect(nearestPoint(records, 300)?.player).toBe('b')
    expect(nearestPoint(records, 0)?.player).toBe('a')
    expect(nearestPoint([{ t: 0 }, { t: 10 }], 5)).toEqual({ t: 0 })
    expect(nearestPoint([], 5)).toBeUndefined()
  })
})

describe('stepRecord', () => {
  // Records at 10.5 s, 20.25 s and 30 s (board times have fractions of a second).
  const records = [{ t: 10_500 }, { t: 20_250 }, { t: 30_000 }]

  it('steps left from today to the latest record, then to each one before, and stops at the first', () => {
    expect(stepRecord(records, null, -1)).toBe(30_000)
    // The address keeps whole seconds, rounded up: 20.25 s is 21 s there.
    expect(stepRecord(records, toSecond(30_000), -1)).toBe(20_250)
    expect(stepRecord(records, toSecond(20_250), -1)).toBe(10_500)
    expect(stepRecord(records, toSecond(10_500), -1)).toBeUndefined()
  })

  it('steps right to the next record, past the latest to today, and no further', () => {
    expect(stepRecord(records, toSecond(10_500), 1)).toBe(20_250)
    expect(stepRecord(records, toSecond(30_000), 1)).toBeNull()
    expect(stepRecord(records, null, 1)).toBeUndefined()
  })

  it('from a moment between records, goes left to the one standing then and right to the next', () => {
    expect(stepRecord(records, 25_000, -1)).toBe(20_250)
    expect(stepRecord(records, 25_000, 1)).toBe(30_000)
    // Before the first record: nothing to the left, the first to the right.
    expect(stepRecord(records, 5_000, -1)).toBeUndefined()
    expect(stepRecord(records, 5_000, 1)).toBe(10_500)
  })

  it('finds the record standing at a moment', () => {
    expect(standingRecord(records, null)).toBe(2)
    expect(standingRecord(records, toSecond(20_250))).toBe(1)
    expect(standingRecord(records, 5_000)).toBe(-1)
    expect(stepRecord([], null, -1)).toBeUndefined()
  })
})

describe('playerColors', () => {
  it('gives each holder a colour in the order they first set a record, ignoring case', () => {
    const colorOf = playerColors([{ player: 'a' }, { player: 'B' }, { player: 'A' }, { player: 'c' }])
    expect(colorOf('a')).toBe(PLAYER_COLORS[0])
    expect(colorOf('b')).toBe(PLAYER_COLORS[1])
    expect(colorOf('C')).toBe(PLAYER_COLORS[2])
  })

  it('goes round again past the last colour', () => {
    const players = PLAYER_COLORS.map((_, i) => ({ player: `p${i}` }))
    expect(playerColors([...players, { player: 'next' }])('next')).toBe(PLAYER_COLORS[0])
  })
})

describe('scoreTicks', () => {
  it('puts the lines at round times around the scores', () => {
    // 22.43 to 29.10: every two seconds.
    expect(scoreTicks(2243, 2910)).toEqual([2200, 2400, 2600, 2800, 3000])
    // 23.65 to 24.88: every half second.
    expect(scoreTicks(2365, 2488)).toEqual([2350, 2400, 2450, 2500])
    // Minutes: 1:57.83 to 2:10.00, every five seconds.
    expect(scoreTicks(11783, 13000)).toEqual([11500, 12000, 12500, 13000])
  })

  it('puts a line either side of a single time', () => {
    expect(scoreTicks(2400, 2400)).toEqual([2399, 2400, 2401])
  })
})
