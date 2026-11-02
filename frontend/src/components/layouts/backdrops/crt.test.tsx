import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Crt } from './crt'

// The signal's drawing needs a real canvas; here it's a stand-in that always wants another frame
// soon, and hands over its picture-loaded callback.
const signal = vi.hoisted(() => ({
  step: vi.fn((_time: number) => 0.05),
  resize: vi.fn(),
  created: 0,
  onLoad: undefined as (() => void) | undefined,
  onChannel: undefined as ((channel: number) => void) | undefined,
}))
vi.mock('./crt-signal', () => ({
  crtSignal: (
    _ctx: unknown,
    _feeds: unknown,
    options: { onLoad?: () => void; onChannel?: (channel: number) => void },
  ) => {
    signal.created++
    signal.onLoad = options.onLoad
    signal.onChannel = options.onChannel
    return { resize: signal.resize, step: signal.step }
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
    signal.resize.mockClear()
    signal.created = 0
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
    // Let the monitor go, for the next test.
    vi.advanceTimersByTime(10_000)
  })

  it('carries on where it was on the next page: the same channel, its clock running on', () => {
    const first = render(<Crt />)
    vi.advanceTimersByTime(3000)
    act(() => signal.onChannel?.(1))
    const before = signal.step.mock.calls.at(-1)![0]
    first.unmount()

    const next = render(<Crt />)
    expect(next.getByText(/CAM 02/)).toBeInTheDocument()
    vi.advanceTimersByTime(100)
    expect(signal.created).toBe(1)
    // Drawn once at its size, not again for the new page.
    expect(signal.resize).toHaveBeenCalledTimes(1)
    expect(signal.step.mock.calls.at(-1)![0]).toBeGreaterThan(before)
    next.unmount()
    vi.advanceTimersByTime(10_000)

    // Once no page has shown it for a while, the next one starts a new monitor.
    render(<Crt />).unmount()
    expect(signal.created).toBe(2)
    vi.advanceTimersByTime(10_000)
  })
})
