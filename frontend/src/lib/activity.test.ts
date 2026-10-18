import { describe, expect, it } from 'vitest'
import { activityWindow, type ActivityView, type ActivityWindow } from './activity'

// Summaries of the legacy outputs (frontend-legacy/src/lib/activity.js) for the same days, "now"
// and offsets, in UTC.
const days = [
  { date: '2026-08-30', count: 3 },
  { date: '2026-09-01', count: 5 },
  { date: '2026-09-02', count: 2 },
  { date: '2026-10-05', count: 4 },
  { date: '2026-10-06', count: 1 },
  { date: '2026-10-17', count: 6 },
]
const now = Date.parse('2026-10-17T15:00:00Z')

const summary = (w: ActivityWindow) => ({
  ...w,
  points: w.points.length,
  first: w.points[0],
  last: w.points[w.points.length - 1],
  total: w.points.reduce((a, p) => a + p.count, 0),
})

const windows: Record<string, [ActivityView, number, boolean?]> = {
  month0: ['month', 0],
  month1: ['month', 1],
  month2: ['month', 2],
  year0: ['year', 0],
  year1: ['year', 1],
  all: ['all', 0],
  empty: ['all', 0, true],
}

describe('activityWindow', () => {
  it.each([
    [
      'month0',
      {
        points: 17,
        label: 'OCTOBER 2026',
        hasPrev: true,
        hasNext: false,
        first: { label: 'OCT 01', count: 0, partial: false },
        last: { label: 'OCT 17', count: 6, partial: true },
        total: 11,
      },
    ],
    [
      'month1',
      {
        points: 30,
        label: 'SEPTEMBER 2026',
        hasPrev: true,
        hasNext: true,
        first: { label: 'SEP 01', count: 5, partial: false },
        last: { label: 'SEP 30', count: 0, partial: false },
        total: 7,
      },
    ],
    [
      'month2',
      {
        points: 31,
        label: 'AUGUST 2026',
        hasPrev: false,
        hasNext: true,
        first: { label: 'AUG 01', count: 0, partial: false },
        last: { label: 'AUG 31', count: 0, partial: false },
        total: 3,
      },
    ],
    [
      'year0',
      {
        points: 42,
        label: '2026',
        hasPrev: false,
        hasNext: false,
        first: { label: 'JAN 01', count: 0 },
        last: { label: 'OCT 12', count: 6 },
        total: 21,
      },
    ],
    [
      'year1',
      {
        points: 53,
        label: '2025',
        hasPrev: false,
        hasNext: true,
        first: { label: 'JAN 01', count: 0 },
        last: { label: 'DEC 29', count: 0 },
        total: 0,
      },
    ],
    [
      'all',
      {
        points: 3,
        label: 'AUG 2026 \u2013 OCT 2026',
        hasPrev: false,
        hasNext: false,
        first: { label: 'AUG 2026', count: 3 },
        last: { label: 'OCT 2026', count: 11 },
        total: 21,
      },
    ],
    [
      'empty',
      {
        points: 1,
        label: 'OCT 2026 \u2013 OCT 2026',
        hasPrev: false,
        hasNext: false,
        first: { label: 'OCT 2026', count: 0 },
        last: { label: 'OCT 2026', count: 0 },
        total: 0,
      },
    ],
  ])('%s', (name, expected) => {
    const [view, offset, empty] = windows[name as string]!
    expect(summary(activityWindow(empty ? [] : days, view, offset, now))).toEqual(expected)
  })

  it('marks only today as partial', () => {
    const w = activityWindow(days, 'month', 0, now)
    expect(w.points.filter((p) => p.partial).map((p) => p.label)).toEqual(['OCT 17'])
  })
})
