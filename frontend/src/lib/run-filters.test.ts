import { describe, expect, it } from 'vitest'
import { BANNED_OPTIONS, RANK_OPTIONS, RUN_LIMITS, RUN_TOGGLES, TIME_OPTIONS } from './run-filters'

// The same options, in the same order, as frontend-legacy/src/lib/runFilters.js.
describe('run filters', () => {
  it('offers the legacy limits and toggles', () => {
    expect(RUN_LIMITS).toEqual(['100', '200', '500'])
    expect(RUN_TOGGLES.map(([key]) => key)).toEqual(['wr', 'video', 'demo', 'pending'])
    expect(RUN_TOGGLES.map(([, label]) => label)).toEqual([
      'World records',
      'Has video',
      'Has demo',
      'Pending',
    ])
  })

  it('offers the rank, time and banned choices', () => {
    expect(RANK_OPTIONS.map((o) => o.value)).toEqual(['', '10', '25', '50', '100', '200'])
    expect(RANK_OPTIONS[1]).toEqual({ value: '10', label: 'Top 10' })
    expect(TIME_OPTIONS.map((o) => o.label)).toEqual([
      'Any time',
      'Last 24 hours',
      'Last 7 days',
      'Last 30 days',
      'Last year',
    ])
    expect(BANNED_OPTIONS.map((o) => o.value)).toEqual(['hide', 'show', 'only'])
  })
})
