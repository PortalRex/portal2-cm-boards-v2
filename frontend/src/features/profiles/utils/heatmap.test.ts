import { describe, expect, it } from 'vitest'
import type { Run } from '@/types/runs'
import {
  allTimeGrid,
  buildGrid,
  heatGrid,
  level,
  runCounts,
  runsByDay,
  scaledLevel,
  utcDay,
  yearOptions,
} from './heatmap'

const run = (id: number, timestamp: string | null, banned = false) => ({ id, timestamp, banned }) as Run

describe('runCounts / runsByDay', () => {
  it('counts runs per UTC day, leaving out banned and undated ones', () => {
    const history = [
      run(1, '2024-03-02T23:00:00'),
      run(2, '2024-03-02T01:00:00'),
      run(3, '2024-03-03T10:00:00', true),
      run(4, null),
    ]
    expect([...runCounts(history)]).toEqual([['2024-03-02', 2]])
    expect(
      runsByDay(history)
        .get('2024-03-02')!
        .map((r) => r.id),
    ).toEqual([2, 1])
  })
})

describe('levels', () => {
  it('shades a day by its run count, and multi-day squares by the busiest square', () => {
    expect([0, 1, 2, 3, 4, 6, 7, 50].map(level)).toEqual([0, 1, 2, 2, 3, 3, 4, 4])
    expect([0, 1, 5, 10].map((n) => scaledLevel(n, 10))).toEqual([0, 1, 2, 4])
  })
})

describe('buildGrid', () => {
  const counts = new Map([
    ['2024-01-01', 2],
    ['2024-02-01', 5],
  ])

  it('lays out Sunday-first weeks with month labels and totals', () => {
    const g = buildGrid(counts, utcDay('2024-01-01'), utcDay('2024-02-29'))
    // 2024-01-01 is a Monday: the first column starts on Sunday 31 Dec, outside the range.
    expect(g.weeks[0]![0]).toEqual({ inRange: false })
    expect(g.weeks[0]![1]).toMatchObject({ n: 2, inRange: true })
    expect(g.weeks).toHaveLength(9)
    expect(g.labels.filter(Boolean)).toEqual(['Jan', 'Feb'])
    expect(g).toMatchObject({ total: 7, activeDays: 2, busiest: 5, busiestDay: 5, span: 1 })
  })

  it('labels the first week with its month when no label follows soon', () => {
    const g = buildGrid(counts, utcDay('2024-01-10'), utcDay('2024-01-30'))
    expect(g.labels[0]).toBe('Jan')
  })
})

describe('allTimeGrid', () => {
  it('fits a long career into about a year of squares, several days each', () => {
    const counts = new Map([
      ['2020-01-01', 1],
      ['2020-01-02', 2],
      ['2024-06-01', 4],
    ])
    const g = allTimeGrid(counts, utcDay('2020-01-01'), utcDay('2024-12-31'))
    expect(g.span).toBe(5)
    expect(g.weeks[0]![0]).toMatchObject({ n: 3, to: utcDay('2020-01-05') })
    expect(g.labels[0]).toBe('2020')
    expect(g.labels.filter(Boolean)).toEqual(['2020', '2021', '2022', '2023', '2024'])
    // The summary line counts days, not squares.
    expect(g).toMatchObject({ total: 7, activeDays: 3, busiestDay: 4 })
  })
})

describe('heatGrid / yearOptions', () => {
  const counts = new Map([
    ['2021-05-01', 1],
    ['2024-05-01', 3],
  ])

  it('covers the past year up to today, a calendar year, or all time', () => {
    const today = utcDay('2024-10-18')
    expect(heatGrid(counts, 'past', today).total).toBe(3)
    expect(heatGrid(counts, 2021, today).total).toBe(1)
    expect(heatGrid(counts, 'all', today).total).toBe(4)
  })

  it('offers every year from the latest to the first, greying out empty ones', () => {
    expect(yearOptions(counts).options).toEqual([
      { value: '2024', label: '2024', disabled: false },
      { value: '2023', label: '2023', disabled: true },
      { value: '2022', label: '2022', disabled: true },
      { value: '2021', label: '2021', disabled: false },
    ])
  })
})
