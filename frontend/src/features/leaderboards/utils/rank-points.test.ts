import { describe, expect, it } from 'vitest'
import { pointsText } from './rank-points'

describe('pointsText', () => {
  it("says a place's points to one decimal, and that places past 200th score none", () => {
    expect(pointsText(200)).toBe('Worth 200 points')
    expect(pointsText(196.02)).toBe('Worth 196 points')
    expect(pointsText(78.125)).toBe('Worth 78.1 points')
    expect(pointsText(0)).toBe('No points (only the top 200 score)')
  })
})
