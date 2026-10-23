import { describe, expect, it } from 'vitest'
import { pointsForRank } from './points'

// The legacy formula (frontend-legacy/src/api/mock.js) and its outputs.
describe('pointsForRank', () => {
  it.each([
    [1, 200],
    [2, 198],
    [10, 182.4],
    [50, 114],
    [100, 51],
    [199, 1],
    [200, 1],
    [201, 0],
    [1000, 0],
  ])('rank %s is worth %s', (rank, points) => expect(pointsForRank(rank)).toBe(points))
})
