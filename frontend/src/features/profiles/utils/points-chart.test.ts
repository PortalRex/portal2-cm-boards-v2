import { describe, expect, it } from 'vitest'
import {
  type ChartRow,
  chartRows,
  dayAt,
  dayMs,
  domainFor,
  fitLines,
  labelAlign,
  labelSide,
  openingView,
  peakClass,
  peakDayAt,
  type PeakSpot,
  placeLabels,
  type PointsSample,
  rowsInView,
  scaleRows,
  valueAt,
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
  it('starts at 0 for the whole history, and fits the shown lines when zoomed', () => {
    const rows = chartRows(samples, null)
    expect(domainFor(['sp'], false, rows, 0, Infinity)).toEqual([0, 'dataMax'])
    // 200..300 in view, padded by 15% of the range.
    expect(domainFor(['sp'], true, rows, dayMs('2024-01-14'), dayMs('2024-01-21'))).toEqual([185, 315])
    // A flat line still gets some room.
    expect(domainFor(['coop'], true, rows, dayMs('2024-01-21'), dayMs('2024-01-21'))).toEqual([57, 63])
  })

  it('gives every shown line the same scale when zoomed, so the higher total stays on top', () => {
    const rows = chartRows(samples, null)
    // Co-op 50..60 and overall 250..360 in view: one scale over 50..360, not one per line.
    expect(domainFor(['coop', 'overall'], true, rows, dayMs('2024-01-14'), dayMs('2024-01-21'))).toEqual([
      3, 407,
    ])
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

describe('chart clicks', () => {
  const rows = [
    { t: 0, date: '2013-02-28' },
    { t: 1, date: '2020-11-12T00:00:00' },
  ] as ChartRow[]

  it('pick the day under the pointer, and nothing without one (not the first day)', () => {
    expect(dayAt(rows, 1)).toBe('2020-11-12')
    expect(dayAt(rows, '1')).toBe('2020-11-12')
    expect(dayAt(rows, null)).toBeNull()
    expect(dayAt(rows, undefined)).toBeNull()
    expect(dayAt(rows, '')).toBeNull()
    expect(dayAt(rows, 7)).toBeNull()
  })

  it("go to a peak's day from its dot or label", () => {
    const peak = { coop: { points: 9596, date: '2020-11-12' }, sp: { points: 12000, date: '2019-08-06' } }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    label.setAttribute('class', `recharts-text ${peakClass('coop')}`)
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    dot.setAttribute('class', `recharts-reference-dot ${peakClass('sp')}`)
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    dot.append(circle)
    svg.append(label, dot)
    expect(peakDayAt(label, peak)).toBe('2020-11-12')
    expect(peakDayAt(circle, peak)).toBe('2019-08-06')
    expect(peakDayAt(svg, peak)).toBeNull()
    expect(peakDayAt(label, null)).toBeNull()
  })
})

describe('labelAlign', () => {
  it('keeps a peak label inside the plot near its ends, centred elsewhere', () => {
    expect(labelAlign(990, [0, 1000])).toBe('end')
    expect(labelAlign(1000, [0, 1000])).toBe('end')
    expect(labelAlign(500, [0, 1000])).toBe('middle')
    expect(labelAlign(30, [0, 1000])).toBe('start')
  })
})

describe('scaleRows', () => {
  it("draws each line against its board's most points, keeping the real points for the tooltip", () => {
    const [row] = scaleRows(chartRows(samples.slice(2, 3), null), { sp: 1000, coop: 250, overall: 1250 })
    // Overall is the biggest board: as it is. Single player 300 of 1000 sits where 375 of 1250 would.
    expect(row).toMatchObject({ sp: 375, coop: 300, overall: 360, pts: { sp: 300, coop: 60, overall: 360 } })
  })

  it("leaves the lines as they are without the boards' sizes", () => {
    expect(scaleRows(chartRows(samples, null), {})[1]).toMatchObject({ sp: 200, coop: 50, overall: 250 })
  })
})

describe('openingView', () => {
  const week = (i: number, overall: number, coop?: number) => ({
    date: '',
    t: i * 7 * 24 * 3600 * 1000,
    overall,
    ...(coop != null ? { coop } : {}),
  })
  const year = 365 * 24 * 3600 * 1000

  it('starts after the last big move, so what came since is readable', () => {
    // Up to 900, a drop to 600, back up to 1000 by week 60, then within 5% of it until week 200.
    const rows = [
      week(0, 0),
      week(20, 900),
      week(40, 600),
      week(59, 900),
      week(60, 1000),
      week(120, 980),
      week(200, 990),
    ]
    expect(openingView(rows, ['overall'])).toEqual([week(60, 0).t, week(200, 0).t])
  })

  it('waits for every line to settle, each held to 5% of the top line', () => {
    // Overall settles at week 60; co-op (drawn at the same scale) jumps at week 90.
    const rows = [
      week(0, 0, 0),
      week(60, 1000, 500),
      week(89, 1000, 600),
      week(90, 1000, 950),
      week(200, 1000, 960),
    ]
    expect(openingView(rows, ['overall', 'coop'])).toEqual([week(90, 0).t, week(200, 0).t])
    expect(openingView(rows, ['overall'])).toEqual([week(60, 0).t, week(200, 0).t])
  })

  it('shows a year at least, and all of it when that leaves out little', () => {
    const movedLately = [week(0, 0), week(100, 800), week(104, 1000)]
    expect(openingView(movedLately, ['overall'])).toEqual([week(104, 0).t - year, week(104, 0).t])
    expect(openingView([week(0, 0), week(5, 990), week(52, 1000)], ['overall'])).toBeNull()
  })

  it('ignores the peaks added between the samples', () => {
    const rows = [
      week(0, 0),
      week(60, 1000),
      { ...week(150, 2000), peakOf: 'overall' as const },
      week(200, 1000),
    ]
    expect(openingView(rows, ['overall'])).toEqual([week(60, 0).t, week(200, 0).t])
  })
})

describe('placeLabels', () => {
  const spot = (key: PeakSpot['key'], x: number, y: number): PeakSpot => ({
    key,
    x,
    y,
    text: 'Peak 21162',
    side: 'top',
    align: 'middle',
  })

  it('keeps apart peaks', () => {
    expect(placeLabels([spot('overall', 100, 50), spot('sp', 300, 50)])).toEqual({
      overall: 'top',
      sp: 'top',
    })
  })

  it("moves a label that would cover another to its dot's other side, or leaves it out", () => {
    // Three peaks on one day, a few pixels apart: the first two take a side each.
    expect(placeLabels([spot('overall', 200, 40), spot('sp', 205, 44), spot('coop', 210, 47)])).toEqual({
      overall: 'top',
      sp: 'bottom',
      coop: null,
    })
  })
})

describe('fitLines', () => {
  it("zoomed in, fits each line to its own range in view, so they're drawn over each other", () => {
    const rows = chartRows(samples, null)
    // Single player 200..300 and co-op 50..60 over the 14th-21st: each fills the same height.
    const fit = fitLines(rows, ['sp', 'coop'], dayMs('2024-01-14'), dayMs('2024-01-21'))
    expect([fit('sp', 200), fit('sp', 300)]).toEqual([0, 1000])
    expect([fit('coop', 50), fit('coop', 60)]).toEqual([0, 1000])
  })

  it("keeps a line's small wobble small: its range is shown as at least 1% of its height", () => {
    const rows = chartRows(
      [
        { date: '2024-01-07', sp: 10000, coop: 0, overall: 10000 },
        { date: '2024-01-14', sp: 10020, coop: 0, overall: 10020 },
      ],
      null,
    )
    const fit = fitLines(rows, ['sp'], dayMs('2024-01-07'), dayMs('2024-01-14'))
    // 20 points of a 100.2-point range (1% of 10020), centred.
    expect(fit('sp', 10020) - fit('sp', 10000)).toBeCloseTo(199.6, 1)
    expect(fit('sp', 10000)).toBeCloseTo(400.2, 1)
  })
})
