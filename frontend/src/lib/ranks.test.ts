import { describe, expect, it } from 'vitest'
import { rankTextColor, rankTileVars, rankVars, WR_COLOR } from './ranks'

// Expected values are the legacy site's outputs (frontend-legacy/src/lib/ranks.js, light scale).
describe('rankTextColor', () => {
  it.each([
    [1, '#d980ff'],
    [2, 'rgb(118, 0, 220)'],
    [5, 'rgb(74, 0, 233)'],
    [10, 'rgb(0, 0, 255)'],
    [15, 'rgb(0, 50, 128)'],
    [20, 'rgb(0, 100, 0)'],
    [35, 'rgb(107, 107, 2)'],
    [50, 'rgb(214, 113, 4)'],
    [200, 'rgb(189, 75, 3)'],
    [500, 'rgb(139, 0, 0)'],
    [501, '#888888'],
  ] as const)('rank %s -> %s', (rank, color) => expect(rankTextColor(rank)).toBe(color))

  it('has no colour without a rank', () => {
    expect(rankTextColor(1)).toBe(WR_COLOR)
    expect(rankTextColor(null)).toBeNull()
  })
})

describe('rankVars', () => {
  it.each([
    [1, { '--rank-color': '#d980ff', '--rank-color-dark': '#d980ff' }],
    // The same colour on dark backgrounds, lifted towards white: the map tags' hue, readable.
    [
      7.6,
      {
        '--rank-color': 'rgb(30, 0, 246)',
        '--rank-color-dark': 'color-mix(in oklab, rgb(30, 0, 246) 55%, white)',
      },
    ],
  ])('rank %s', (rank, vars) => expect(rankVars(rank)).toEqual(vars))

  it('is undefined without a rank', () => expect(rankVars(undefined)).toBeUndefined())
})

describe('rankTileVars', () => {
  it('uses the map boards’ colours, so a rank looks the same on the profile', () => {
    for (const rank of [2, 5, 10, 15, 40, 44, 75, 125, 200, 501])
      expect(rankTileVars(rank)).toEqual(rankVars(rank))
  })

  it('shows a world record in the trophy colour', () =>
    expect(rankTileVars(1)).toEqual({
      '--rank-color': 'var(--trophy)',
      '--rank-color-dark': 'var(--trophy)',
    }))

  it('is undefined without a rank', () => expect(rankTileVars(null)).toBeUndefined())
})
