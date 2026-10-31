import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { PointsChange } from './points-change'

describe('PointsChange', () => {
  it('says how many points changed in a bubble on hover, with or without the amount beside it', async () => {
    const { rerender } = render(<PointsChange change={12.5} days={30} />)
    const arrow = screen.getByRole('img', { name: '+12.5 points in the last 30 days' })
    expect(screen.queryByRole('tooltip')).toBeNull()
    await userEvent.hover(arrow)
    expect(screen.getByRole('tooltip')).toHaveTextContent('+12.5 points in the last 30 days')
    await userEvent.unhover(arrow)
    expect(screen.queryByRole('tooltip')).toBeNull()

    rerender(<PointsChange change={-25} days={30} showAmount />)
    expect(screen.getByText('-25')).toBeInTheDocument()
    await userEvent.hover(screen.getByRole('img', { name: '-25 points in the last 30 days' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('-25 points in the last 30 days')
  })

  it('opens the bubble from the keyboard when only the arrow is shown', async () => {
    render(<PointsChange change={-1} days={30} />)
    await userEvent.tab()
    expect(screen.getByRole('tooltip')).toHaveTextContent('-1 point in the last 30 days')
  })

  it('shows nothing without a change', () => {
    const { container } = render(<PointsChange change={0} days={30} />)
    expect(container).toBeEmptyDOMElement()
  })
})
