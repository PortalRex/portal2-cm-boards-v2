import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { API } from '@/testing/mocks/handlers'
import { FIXTURE_PLAYER, serveProfile } from '@/testing/mocks/profile'
import { server } from '@/testing/mocks/server'
import { renderWithProviders } from '@/testing/test-utils'
import { PointsChart } from './points-chart'

const chart = () =>
  renderWithProviders(<PointsChart profileNumber={FIXTURE_PLAYER} peak={null} at={null} onPick={() => {}} />)

describe('PointsChart', () => {
  it('draws the history with a legend that hides and shows each line', async () => {
    serveProfile()
    await chart()
    expect(await screen.findByText('Points over time')).toBeInTheDocument()
    const sp = screen.getByRole('button', { name: 'Singleplayer' })
    expect(sp).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(sp)
    expect(sp).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(sp)
    expect(sp).toHaveAttribute('aria-pressed', 'true')
  })

  it('zooms with the scroll wheel, until reset', async () => {
    serveProfile()
    await chart()
    const plot = await screen.findByTestId('points-chart')
    fireEvent.wheel(plot, { deltaY: -100 })
    await userEvent.click(await screen.findByRole('button', { name: 'Reset zoom' }))
    expect(screen.queryByRole('button', { name: 'Reset zoom' })).not.toBeInTheDocument()
  })

  it('zooms with the bar under it, like the other history charts', async () => {
    serveProfile()
    await chart()
    // The bar is 1000px wide; jsdom doesn't capture pointers.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 1000, height: 40 }),
    )
    HTMLElement.prototype.setPointerCapture = vi.fn()
    const win = await screen.findByTestId('history-minimap-window')
    expect(win).toHaveStyle({ left: '0%', width: '100%' })
    // Its left edge dragged halfway: the second half of the history in view.
    const start = win.querySelector('[data-edge="start"]')!
    fireEvent.pointerDown(start, { clientX: 0, button: 0 })
    fireEvent.pointerMove(start, { clientX: 500 })
    fireEvent.pointerUp(start)
    expect(win).toHaveStyle({ left: '50%', width: '50%' })
    await userEvent.click(screen.getByRole('button', { name: 'Reset zoom' }))
    expect(win).toHaveStyle({ left: '0%', width: '100%' })
    vi.restoreAllMocks()
  })

  it('says so when there is too little history', async () => {
    server.use(
      http.get(`${API}/profile/points_history/:id`, () =>
        HttpResponse.json([{ date: '2024-01-07', sp: 1, coop: 0, overall: 1 }]),
      ),
    )
    await chart()
    expect(await screen.findByText('Not enough submissions for a points history yet.')).toBeInTheDocument()
  })

  it("says so when the history can't be loaded", async () => {
    server.use(http.get(`${API}/profile/points_history/:id`, () => new HttpResponse(null, { status: 500 })))
    await chart()
    expect(await screen.findByText('Couldn’t load the points history right now.')).toBeInTheDocument()
  })
})
