import { describe, expect, it } from 'vitest'
import { fitDomain, panDomain, pinchDomain, revealDomain, zoomDomain } from './use-wheel-zoom'

const full: [number, number] = [0, 1000]

describe('zoom helpers', () => {
  it('keeps a view inside the whole range, and drops it once it covers all of it', () => {
    expect(fitDomain(full, 100, 200)).toEqual([100, 300])
    expect(fitDomain(full, -50, 200)).toEqual([0, 200])
    expect(fitDomain(full, 900, 200)).toEqual([800, 1000])
    expect(fitDomain(full, 0, 1000)).toBeNull()
  })

  it('pinches around the fingers, keeping the moment between them under them', () => {
    // Fingers twice as far apart, halfway across: half as wide around the middle.
    expect(pinchDomain([0, 1000], full, 0.5, 0.5, 0.5, 1)).toEqual([250, 750])
    // Fingers moved to a quarter of the way across while pinching: the middle (500) follows them.
    expect(pinchDomain([0, 1000], full, 0.5, 0.25, 0.5, 1)).toEqual([375, 875])
    // Never narrower than the smallest span; pinched out past the whole range: all of it.
    expect(pinchDomain([400, 600], full, 0.5, 0.5, 0.1, 100)).toEqual([450, 550])
    expect(pinchDomain([250, 750], full, 0.5, 0.5, 3, 1)).toBeNull()
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

  it('moves the view to show a moment outside it, a tenth in from the edge', () => {
    // Inside: stays.
    expect(revealDomain([100, 300], full, 250)).toEqual([100, 300])
    // Past the right edge: it's a tenth in from the right.
    expect(revealDomain([100, 300], full, 500)).toEqual([320, 520])
    // Before the left edge: a tenth in from the left, stopping at the start.
    expect(revealDomain([100, 300], full, 50)).toEqual([30, 230])
    expect(revealDomain([100, 300], full, 5)).toEqual([0, 200])
    // Not zoomed: everything shows already.
    expect(revealDomain(null, full, 500)).toBeNull()
  })
})
