import { describe, expect, it } from 'vitest'
import { stepPoints } from './steps'

describe('stepPoints', () => {
  it('gives each wide flat stretch a point at both ends carrying its value, on to the end', () => {
    const points = [
      { t: 10, score: 1530 },
      { t: 20, score: 1503 },
    ]
    expect(stepPoints(points, 30)).toEqual([
      { t: 10, score: 1530 },
      { t: 19.9, score: 1530, carried: true, setAt: 10 },
      { t: 20, score: 1503 },
      { t: 30, score: 1503, carried: true, setAt: 20 },
    ])
  })

  it('leaves stretches under 1% of the chart alone, so their step stays the nearest point', () => {
    // 0 to 1000: the stretch from 500 to 505 is too narrow for a copy of its own.
    const points = [
      { t: 0, score: 3 },
      { t: 500, score: 2 },
      { t: 505, score: 1 },
    ]
    expect(stepPoints(points, 1000).map((p) => [p.t, p.score])).toEqual([
      [0, 3],
      [495, 3],
      [500, 2],
      [505, 1],
      [1000, 1],
    ])
  })

  it("keeps a carried point's own day, and adds nothing past the end", () => {
    const start = { t: 5, score: 900, setAt: 1 }
    expect(stepPoints([start, { t: 9, score: 800 }], 9)[1]).toEqual({
      t: 8.98,
      score: 900,
      carried: true,
      setAt: 1,
    })
    expect(stepPoints([], 9)).toEqual([])
  })
})
