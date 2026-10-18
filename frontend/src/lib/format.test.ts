import { describe, expect, it } from 'vitest'
import {
  formatDate,
  formatDateTime,
  formatDelta,
  formatLongScore,
  formatPoints,
  formatScore,
  ordinalSuffix,
  parseTimestamp,
  timeAgo,
} from './format'

// Expected values are the legacy site's outputs (frontend-legacy/src/lib/format.js), with the
// tests' time zone fixed to UTC (vitest.config.ts).
describe('formatScore', () => {
  it.each([
    [2243, '22.43'],
    [11783, '1:57.83'],
    [0, '0.00'],
    [5, '0.05'],
    [100, '1.00'],
    [6000, '1:00.00'],
    [34530, '5:45.30'],
    [319851, '53:18.51'],
    [-42, '-0.42'],
    [12.6, '0.13'],
    [null, ''],
  ])('%s -> %s', (cs, text) => expect(formatScore(cs)).toBe(text))

  it('formats long aggregated times the same way', () => expect(formatLongScore(319851)).toBe('53:18.51'))
})

describe('formatDelta', () => {
  it.each([
    [12, '+0.12'],
    [-42, '-0.42'],
    [0, '±0.00'],
    [6123, '+1:01.23'],
    [null, ''],
  ])('%s -> %s', (cs, text) => expect(formatDelta(cs)).toBe(text))

  it('appends a suffix', () => expect(formatDelta(-5, 's')).toBe('-0.05s'))
})

describe('parseTimestamp', () => {
  it('reads zone-less API timestamps as UTC', () => {
    expect(parseTimestamp('2026-10-12T15:59:13').toISOString()).toBe('2026-10-12T15:59:13.000Z')
  })
  it('keeps explicit zones', () => {
    expect(parseTimestamp('2026-10-12T15:59:13+02:00').toISOString()).toBe('2026-10-12T13:59:13.000Z')
    expect(parseTimestamp('2026-10-12T15:59:13Z').toISOString()).toBe('2026-10-12T15:59:13.000Z')
  })
  it('passes dates, numbers and nulls through', () => {
    expect(parseTimestamp(0).getTime()).toBe(0)
    expect(parseTimestamp(new Date(5)).getTime()).toBe(5)
    expect(parseTimestamp(null)).toBeNull()
  })
})

describe('timeAgo', () => {
  const now = Date.parse('2026-10-17T12:00:00Z')
  it.each([
    ['2026-10-17T11:59:30', 'just now'],
    ['2026-10-17T11:58:00', '2 minutes ago'],
    ['2026-10-17T10:00:00', '2 hours ago'],
    ['2026-10-16T12:00:00', '1 day ago'],
    ['2026-08-01T00:00:00', '2 months ago'],
    ['2024-10-01T00:00:00Z', '2 years ago'],
    ['2026-10-18T00:00:00', 'just now'],
  ])('%s -> %s', (timestamp, text) => expect(timeAgo(timestamp, now)).toBe(text))

  it('is empty without a timestamp', () => expect(timeAgo(null)).toBe(''))
})

describe('formatDate / formatDateTime', () => {
  it.each([
    ['2026-09-25', '2026-09-25'],
    ['2026-10-13T19:03:55', '2026-10-13'],
    ['2026-10-13T23:30:00+02:00', '2026-10-13'],
  ])('formatDate(%s) -> %s', (timestamp, text) => expect(formatDate(timestamp)).toBe(text))

  it.each([
    ['2026-10-13T19:03:55', 'Tue, 2026-10-13, 19:03:55'],
    ['2026-09-25', '2026-09-25'],
  ])('formatDateTime(%s) -> %s', (timestamp, text) => expect(formatDateTime(timestamp)).toBe(text))

  it('is empty without a timestamp', () => {
    expect(formatDate(undefined)).toBe('')
    expect(formatDateTime('')).toBe('')
  })
})

describe('ordinalSuffix', () => {
  it.each([
    [1, 'st'],
    [2, 'nd'],
    [3, 'rd'],
    [4, 'th'],
    [11, 'th'],
    [12, 'th'],
    [13, 'th'],
    [21, 'st'],
    [22, 'nd'],
    [101, 'st'],
    [111, 'th'],
    [112, 'th'],
    [123, 'rd'],
  ])('%s%s', (n, suffix) => expect(ordinalSuffix(n)).toBe(suffix))
})

describe('formatPoints', () => {
  it.each([
    [12.4, '12'],
    [12.5, '13'],
    [0, '0'],
    [null, ''],
  ])('%s -> %s', (points, text) => expect(formatPoints(points)).toBe(text))
})
