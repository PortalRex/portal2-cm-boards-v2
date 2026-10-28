import { describe, expect, it } from 'vitest'
import { fromFirstRecord } from './race'

const frame = (date: string, held: number[]) => ({
  date,
  top: held.map((h, i) => ({ profileNumber: String(i), held: h })),
})

describe('fromFirstRecord', () => {
  it('starts at the first month anyone held a record', () => {
    const frames = [frame('2012-08', []), frame('2012-09', []), frame('2012-10', [1]), frame('2012-11', [])]
    expect(fromFirstRecord(frames).map((f) => f.date)).toEqual(['2012-10', '2012-11'])
  })

  it('is empty when no month has a record', () => {
    expect(fromFirstRecord([frame('2012-08', [])])).toEqual([])
  })
})
