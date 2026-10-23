import { describe, expect, it } from 'vitest'
import { rankTextColor, rankTileVars, rankVars, WR_COLOR } from './ranks'

// Expected values are the legacy site's outputs (frontend-legacy/src/lib/ranks.js).
describe('rankTextColor', () => {
  it.each([
    [1, 'dark', '#d980ff'],
    [1, 'light', '#d980ff'],
    [2, 'dark', 'rgb(225, 147, 236)'],
    [2, 'light', 'rgb(118, 0, 220)'],
    [5, 'dark', 'rgb(206, 173, 234)'],
    [5, 'light', 'rgb(74, 0, 233)'],
    [10, 'dark', 'rgb(173, 216, 230)'],
    [10, 'light', 'rgb(0, 0, 255)'],
    [15, 'dark', 'rgb(120, 236, 148)'],
    [15, 'light', 'rgb(0, 50, 128)'],
    [20, 'dark', 'rgb(66, 255, 66)'],
    [20, 'light', 'rgb(0, 100, 0)'],
    [35, 'dark', 'rgb(161, 210, 66)'],
    [35, 'light', 'rgb(107, 107, 2)'],
    [50, 'dark', 'rgb(255, 165, 66)'],
    [50, 'light', 'rgb(214, 113, 4)'],
    [200, 'dark', 'rgb(255, 132, 66)'],
    [200, 'light', 'rgb(189, 75, 3)'],
    [500, 'dark', 'rgb(255, 66, 66)'],
    [500, 'light', 'rgb(139, 0, 0)'],
    [501, 'dark', '#888888'],
    [501, 'light', '#888888'],
  ] as const)('rank %s on %s -> %s', (rank, scale, color) => expect(rankTextColor(rank, scale)).toBe(color))

  it('defaults to the dark scale and has no colour without a rank', () => {
    expect(rankTextColor(1)).toBe(WR_COLOR)
    expect(rankTextColor(20)).toBe('rgb(66, 255, 66)')
    expect(rankTextColor(null)).toBeNull()
  })
})

describe('rankVars', () => {
  it.each([
    [1, { '--rank-color': '#d980ff', '--rank-color-dark': '#d980ff' }],
    [7.6, { '--rank-color': 'rgb(30, 0, 246)', '--rank-color-dark': 'rgb(186, 199, 232)' }],
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
