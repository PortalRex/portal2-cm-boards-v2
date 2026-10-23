import { describe, expect, it } from 'vitest'
import {
  playerRole,
  POINT_ROLES,
  roleIcon,
  roleProgress,
  type PeakPoints,
  type Points,
  type PointsBoard,
} from './roles'

// Expected values are the legacy outputs (frontend-legacy/src/data/roles.js).
describe('playerRole', () => {
  it.each([
    [{}, null, false, null],
    [{ sp: 249 }, null, false, null],
    [{ sp: 250 }, null, false, 'Beginner'],
    [{ coop: 4500 }, null, false, 'Advanced'],
    [{ sp: 100, coop: 100, overall: 12500 }, null, false, 'Expert'],
    [{ sp: 11700 }, null, false, 'Legends'],
    [{ sp: 5000 }, { overall: { points: 21000 } }, false, 'Legends (peak)'],
    [{ sp: 5000 }, null, true, 'Legends (peak)'],
    [{ overall: 21000 }, null, true, 'Legends'],
    [{ sp: 5000 }, { sp: { points: 11699 } }, false, 'Advanced'],
  ] as [Points, PeakPoints | null, boolean, string | null][])(
    '%j (peak %j, kept %s) -> %s',
    (points, peak, kept, expected) => {
      const role = playerRole(points, peak, kept)
      expect(role && (role.fromPeak ? `${role.name} (peak)` : role.name)).toBe(expected)
    },
  )
})

describe('roleProgress', () => {
  it.each([
    ['sp', 0, { next: 'Beginner', target: 250, missing: 250, percent: 0, current: null }],
    ['sp', 250, { next: 'Amateur', target: 1500, missing: 1250, percent: 16, current: 'Beginner' }],
    ['sp', 1000, { next: 'Amateur', target: 1500, missing: 500, percent: 66, current: 'Beginner' }],
    ['coop', 9449.5, { next: 'Legends', target: 9450, missing: 1, percent: 99, current: 'Elite' }],
    ['overall', 5000, { next: 'Expert', target: 12500, missing: 7500, percent: 40, current: null }],
    ['overall', 21000, { reached: 'Legends', percent: 100, current: 'Legends' }],
    ['sp', 20000, { reached: 'Legends', percent: 100, current: 'Legends' }],
  ] as [PointsBoard, number, Record<string, unknown>][])('%s %s', (board, points, expected) => {
    const progress = roleProgress(board, points)
    expect({ ...progress, current: progress.current?.name ?? null }).toEqual(expected)
  })
})

describe('roleIcon', () => {
  it('points at the bundled icon', () => {
    expect(roleIcon(POINT_ROLES[0])).toBe('/roles/beginner.png')
    expect(roleIcon(null)).toBeNull()
  })
})
