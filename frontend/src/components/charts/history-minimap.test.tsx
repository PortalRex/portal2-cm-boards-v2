import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistoryPoint } from '@/lib/charts/history'
import { HistoryMinimap } from './history-minimap'

const DAY = 24 * 3600 * 1000
const records: HistoryPoint[] = [
  { t: 0, score: 2400, player: 'a', gain: null },
  { t: 500 * DAY, score: 2300, player: 'b', gain: 100 },
]
// The whole history is 1000 days, drawn 1000px wide: a pixel a day.
const full: [number, number] = [0, 1000 * DAY]

describe('HistoryMinimap', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 1000, height: 40 }),
    )
    // jsdom doesn't capture pointers.
    HTMLElement.prototype.setPointerCapture = vi.fn()
  })
  afterEach(() => vi.restoreAllMocks())

  const renderMap = (zoom: [number, number] | null) => {
    const onZoom = vi.fn()
    render(<HistoryMinimap records={records} full={full} zoom={zoom} onZoom={onZoom} minSpan={7 * DAY} />)
    return onZoom
  }

  it('shows the part in view as a window', () => {
    renderMap([100 * DAY, 300 * DAY])
    expect(screen.getByTestId('history-minimap-window')).toHaveStyle({ left: '10%', width: '20%' })
  })

  it('moves the window to a click beside it, centred there', () => {
    const onZoom = renderMap([100 * DAY, 300 * DAY])
    fireEvent.pointerDown(screen.getByTestId('history-minimap'), { clientX: 800, button: 0 })
    expect(onZoom).toHaveBeenLastCalledWith([700 * DAY, 900 * DAY])
  })

  it('moves the view with the window, and zooms by dragging its edges', () => {
    const onZoom = renderMap([100 * DAY, 300 * DAY])
    const win = screen.getByTestId('history-minimap-window')
    fireEvent.pointerDown(win, { clientX: 200, button: 0 })
    fireEvent.pointerMove(win, { clientX: 250 })
    expect(onZoom).toHaveBeenLastCalledWith([150 * DAY, 350 * DAY])
    fireEvent.pointerUp(win)

    const [start, end] = win.querySelectorAll('[data-edge]')
    fireEvent.pointerDown(start!, { clientX: 100, button: 0 })
    fireEvent.pointerMove(start!, { clientX: 50 })
    expect(onZoom).toHaveBeenLastCalledWith([50 * DAY, 300 * DAY])
    fireEvent.pointerUp(start!)

    fireEvent.pointerDown(end!, { clientX: 300, button: 0 })
    fireEvent.pointerMove(end!, { clientX: 2000 })
    // Stops at today.
    expect(onZoom).toHaveBeenLastCalledWith([100 * DAY, 1000 * DAY])
  })

  it('drops the zoom once the window covers the whole history', () => {
    const onZoom = renderMap([100 * DAY, 1000 * DAY])
    const start = screen.getByTestId('history-minimap-window').querySelector('[data-edge=start]')!
    fireEvent.pointerDown(start, { clientX: 100, button: 0 })
    fireEvent.pointerMove(start, { clientX: -500 })
    expect(onZoom).toHaveBeenLastCalledWith(null)
  })
})
