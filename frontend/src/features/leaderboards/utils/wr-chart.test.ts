import { describe, expect, it } from 'vitest'
import changelog from '@/testing/fixtures/changelog.json'
import type { ChangelogRaw } from '@/types/runs'
import { runningBest, wrRuns } from './wr-chart'

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

describe('wrRuns', () => {
  const row = (over: Partial<ChangelogRaw>): ChangelogRaw => ({
    ...(changelog as ChangelogRaw[])[0]!,
    blue_name: null,
    orange_name: null,
    ...over,
  })

  it("makes a co-op run's two entries one record, named after both partners, at the earlier time", () => {
    const pair = { coop_id: 5794, score: 1765, blue_name: 'Zypeh', orange_name: 'unity' }
    expect(
      wrRuns([
        row({ ...pair, id: 1, user_name: 'unity', timestamp: '2022-01-06T19:05:53' }),
        row({ ...pair, id: 2, user_name: 'Zypeh', timestamp: '2022-01-06T19:05:52' }),
        row({ id: 3, coop_id: null, score: 1760, user_name: 'Solo', timestamp: '2023-05-05T20:26:14' }),
      ]),
    ).toEqual([
      { timestamp: '2022-01-06T19:05:52', score: 1765, player: 'Zypeh & unity' },
      { timestamp: '2023-05-05T20:26:14', score: 1760, player: 'Solo' },
    ])
  })

  it('names a half without a known partner after its own player', () => {
    const half = row({ coop_id: 33606, user_name: 'Imanex', blue_name: 'Imanex', orange_name: 'N/A' })
    expect(wrRuns([half])[0]!.player).toBe('Imanex')
  })
})
