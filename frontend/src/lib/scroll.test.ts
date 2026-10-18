import { afterEach, describe, expect, it, vi } from 'vitest'
import { easeInOutCubic, scrollDuration, scrollToCentre } from './scroll'

const element = (top: number, height = 100) =>
  ({ getBoundingClientRect: () => ({ top, height }) }) as unknown as Element

describe('scrollToCentre', () => {
  afterEach(() => vi.restoreAllMocks())

  it('eases in and out and takes longer for longer trips, within limits', () => {
    expect([easeInOutCubic(0), easeInOutCubic(0.5), easeInOutCubic(1)]).toEqual([0, 0.5, 1])
    expect(easeInOutCubic(0.25)).toBeLessThan(0.25)
    expect(scrollDuration(10)).toBe(450)
    expect(scrollDuration(1000)).toBe(700)
    expect(scrollDuration(-10000)).toBe(1100)
  })

  it('jumps straight there with reduced motion', () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 5000, configurable: true })
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    scrollToCentre(element(1500))
    // innerHeight is 768 in jsdom: the element's middle ends up in the viewport's middle.
    expect(scrollTo).toHaveBeenCalledWith(0, 1500 - (768 - 100) / 2)
  })

  it('does nothing without an element or when it is already centred', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    scrollToCentre(null)
    scrollToCentre(element((768 - 100) / 2))
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
