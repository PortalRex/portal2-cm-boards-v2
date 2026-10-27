import { describe, expect, it } from 'vitest'
import { runningBest, wrChartData, type ChartPoint } from './wr-chart'

const record = (t: number, score: number, player: string, gain: number | null): ChartPoint => ({
  timestamp: null,
  t,
  score,
  player,
  gain,
})
// Three records: day 10, day 500 and day 501 (the latest, a day after the one before).
const records = [record(10, 1530, 'a', null), record(500, 1503, 'b', 27), record(501, 1475, 'c', 28)]

describe('wrChartData', () => {
  it('carries each record along its flat line to just before the next, the latest on to today', () => {
    const data = wrChartData(records, 0, 1000, 1000)
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
    const data = wrChartData(records, 300, 500, 1000)
    expect(data.map((d) => [d.t, d.player])).toEqual([
      [300, 'a'],
      [499, 'a'],
      [500, 'b'],
    ])
    expect(data[0]).toMatchObject({ carried: true, setAt: 10 })
    expect(data[1]).toMatchObject({ carried: true, setAt: 10 })
  })
})

describe('runningBest', () => {
  it('keeps each record that was the best yet, ties included, and drops slower later ones', () => {
    const point = (score: number, player: string) => ({ timestamp: '2012-01-01T00:00:00', score, player })
    // An old 26.53, then the boards' first "records" (28.28, 28.01) and a 26.53 tie, then 25.58.
    const kept = runningBest([
      point(2653, 'old'),
      point(2828, 'board 1'),
      point(2801, 'board 2'),
      point(2653, 'tie'),
      point(2558, 'faster'),
    ])
    expect(kept.map((p) => p.player)).toEqual(['old', 'tie', 'faster'])
  })
})
