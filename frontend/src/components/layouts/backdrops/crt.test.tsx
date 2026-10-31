import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Crt } from './crt'

// The signal's drawing needs a real canvas; here it's a stand-in that always wants another frame
// soon, and hands over its picture-loaded callback.
const signal = vi.hoisted(() => ({
  step: vi.fn(() => 0.05),
  onLoad: undefined as (() => void) | undefined,
}))
vi.mock('./crt-signal', () => ({
  crtSignal: (_ctx: unknown, _feeds: unknown, options: { onLoad?: () => void }) => {
    signal.onLoad = options.onLoad
    return { resize: () => {}, step: signal.step }
  },
}))

describe('Crt', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // jsdom has no layout or canvas: just enough for the component to start its loop.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as never)
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 16),
    )
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
    signal.step.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('steps the signal while on screen, and not at all once gone, even when a picture loads late', () => {
    const { unmount } = render(<Crt />)
    vi.advanceTimersByTime(500)
    expect(signal.step.mock.calls.length).toBeGreaterThan(2)

    unmount()
    signal.step.mockClear()
    // A channel picture finishing its download after the page has gone.
    signal.onLoad?.()
    vi.advanceTimersByTime(2000)
    expect(signal.step).not.toHaveBeenCalled()
  })
})
