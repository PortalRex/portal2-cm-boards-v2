import { describe, expect, it } from 'vitest'
import { fitDomain, panDomain, zoomDomain } from './use-wheel-zoom'

const full: [number, number] = [0, 1000]

describe('zoom helpers', () => {
  it('keeps a view inside the whole range, and drops it once it covers all of it', () => {
    expect(fitDomain(full, 100, 200)).toEqual([100, 300])
    expect(fitDomain(full, -50, 200)).toEqual([0, 200])
    expect(fitDomain(full, 900, 200)).toEqual([800, 1000])
    expect(fitDomain(full, 0, 1000)).toBeNull()
  })

  it('zooms around the pointer, keeping the point under it in place', () => {
    // A quarter of the way across the whole range: 250 stays a quarter of the way across.
    expect(zoomDomain(null, full, 0.25, true, 1)).toEqual([50, 850])
    // Zoomed out past the whole range: all of it.
    expect(zoomDomain([50, 850], full, 0.25, false, 1)).toBeNull()
    // Never narrower than the smallest span.
    expect(zoomDomain([100, 200], full, 0.5, true, 100)).toEqual([100, 200])
  })

  it('moves the view along, stopping at the ends', () => {
    expect(panDomain([100, 300], full, 50)).toEqual([150, 350])
    expect(panDomain([100, 300], full, -500)).toEqual([0, 200])
    expect(panDomain(null, full, 50)).toBeNull()
  })
})
