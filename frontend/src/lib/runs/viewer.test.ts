import { describe, expect, it } from 'vitest'
import { viewerUrl } from './viewer'

describe('viewerUrl', () => {
  it('opens a single demo', () => {
    expect(viewerUrl([42])).toBe('/viewer/#board=42')
  })

  it('opens the first demo with the partner', () => {
    expect(viewerUrl([7, 9])).toBe('/viewer/#board=7&with=9')
  })

  it('skips missing demos and repeats', () => {
    expect(viewerUrl([null, 9, undefined, 9])).toBe('/viewer/#board=9')
  })

  it('is null without a demo', () => {
    expect(viewerUrl([null, undefined])).toBeNull()
    expect(viewerUrl([])).toBeNull()
  })
})
