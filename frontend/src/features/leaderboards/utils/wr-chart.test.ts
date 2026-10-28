import { describe, expect, it } from 'vitest'
import { runningBest } from './wr-chart'

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
