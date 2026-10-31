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
    [
      1,
      {
        '--rank-color': '#d980ff',
        '--rank-color-dark': '#d980ff',
        '--rank-color-soft': '#d980ff',
        '--rank-text': 'rgb(232, 121, 255)',
        '--rank-text-dark': 'rgb(232, 121, 255)',
      },
    ],
    // The same colour on dark backgrounds, lifted towards white: the map tags' hue, readable. The soft
    // one is rank 8 on the old site's dark scale.
    [
      7.6,
      {
        '--rank-color': 'rgb(30, 0, 246)',
        '--rank-color-dark': 'color-mix(in oklab, rgb(30, 0, 246) 55%, white)',
        '--rank-color-soft': 'rgb(186, 199, 232)',
        '--rank-text': 'rgb(31, 0, 255)',
        '--rank-text-dark': 'rgb(101, 150, 255)',
      },
    ],
  ])('rank %s', (rank, vars) => expect(rankVars(rank)).toEqual(vars))

  it('gives numbers written out the colours 25% more saturated, as CSS saturate(1.25) draws them', () => {
    // Read from Chrome: a canvas filled with the colour (lifted on dark) under saturate(1.25).
    expect(rankVars(35)!['--rank-text-dark']).toBe('rgb(170, 173, 117)')
    expect(rankVars(7.6)!['--rank-text-dark']).toBe('rgb(101, 150, 255)')
    // Grey has nothing to saturate.
    expect(rankVars(501)!['--rank-text']).toBe('rgb(136, 136, 136)')
  })

  it('gives the old dark scale as the soft colour, for low-contrast rank tags', () => {
    // The old site's stops: violet at 1, light blue at 10, green at 20, orange at 50, red at 500.
    expect(rankVars(10)!['--rank-color-soft']).toBe('rgb(173, 216, 230)')
    expect(rankVars(20)!['--rank-color-soft']).toBe('rgb(66, 255, 66)')
    expect(rankVars(5)!['--rank-color-soft']).toBe('rgb(206, 173, 234)')
    expect(rankVars(501)!['--rank-color-soft']).toBe('#888888')
  })

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
      '--rank-color-soft': 'var(--trophy)',
    }))

  it('is undefined without a rank', () => expect(rankTileVars(null)).toBeUndefined())
})
