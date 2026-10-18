import { describe, expect, it } from 'vitest'
import {
  chartRows,
  dayMs,
  domainFor,
  labelSide,
  rowsInView,
  valueAt,
  type PointsSample,
} from './points-chart'

const samples: PointsSample[] = [
  { date: '2024-01-07', sp: 100, coop: 0, overall: 100 },
  { date: '2024-01-14', sp: 200, coop: 50, overall: 250 },
  { date: '2024-01-21', sp: 300, coop: 60, overall: 360 },
  { date: '2024-01-28', sp: 280, coop: 70, overall: 350 },
]

describe('chartRows', () => {
  it("adds each board's peak between the weekly samples, in date order", () => {
    const rows = chartRows(samples, {
      sp: { points: 310.4, date: '2024-01-24' },
      coop: { points: 0, date: '2024-01-01' },
    })
    expect(rows.map((r) => r.date)).toEqual([
      '2024-01-07',
      '2024-01-14',
      '2024-01-21',
      '2024-01-24',
      '2024-01-28',
    ])
    expect(rows[3]).toEqual({ date: '2024-01-24', t: dayMs('2024-01-24'), sp: 310, peakOf: 'sp' })
  })

  it('adds no peaks to a history too short to draw', () => {
    expect(chartRows(samples.slice(0, 1), { sp: { points: 9, date: '2024-02-01' } })).toHaveLength(1)
  })
})

describe('rowsInView', () => {
  it('keeps the samples either side of the view so the lines reach its edges', () => {
    const rows = chartRows(samples, null)
    const view = rowsInView(rows, dayMs('2024-01-15'), dayMs('2024-01-22'))
    expect(view.map((r) => r.date)).toEqual(['2024-01-14', '2024-01-21', '2024-01-28'])
  })
})

describe('domainFor', () => {
  it('shares one scale from 0 for the whole history, and fits each line when zoomed', () => {
    const rows = chartRows(samples, null)
    expect(domainFor('sp', false, rows, 0, Infinity)).toEqual([0, 'dataMax'])
    // 200..300 in view, padded by 15% of the range.
    expect(domainFor('sp', true, rows, dayMs('2024-01-14'), dayMs('2024-01-21'))).toEqual([185, 315])
    // A flat line still gets some room.
    expect(domainFor('coop', true, rows, dayMs('2024-01-21'), dayMs('2024-01-21'))).toEqual([57, 63])
  })
})

describe('valueAt', () => {
  it('reads a line between its samples', () => {
    const rows = chartRows(samples, null)
    expect(valueAt(rows, 'sp', dayMs('2024-01-10') + 12 * 3600 * 1000)).toBe(150)
    expect(valueAt(rows, 'sp', dayMs('2025-01-01'))).toBe(280)
    expect(valueAt(rows, 'sp', dayMs('2023-01-01'))).toBe(100)
  })
})

describe('labelSide', () => {
  it('puts a peak label above its dot unless another line runs just above it', () => {
    const rows = chartRows(samples, null)
    const range: [number, number] = [rows[0]!.t, rows[rows.length - 1]!.t]
    const t = dayMs('2024-01-21')
    // Overall is the top line: room above.
    expect(labelSide(rows, rows, ['sp', 'coop', 'overall'], false, range, 'overall', t, 360)).toBe('top')
    // 300 of 360 leaves 21 px under the overall line: enough room above.
    expect(labelSide(rows, rows, ['sp', 'coop', 'overall'], false, range, 'sp', t, 300)).toBe('top')
    // A dot 4 px under the overall line: the label goes below.
    expect(labelSide(rows, rows, ['sp', 'coop', 'overall'], false, range, 'sp', t, 350)).toBe('bottom')
    // With overall hidden, single player is the top line.
    expect(labelSide(rows, rows, ['sp', 'coop'], false, range, 'sp', t, 300)).toBe('top')
  })
})
