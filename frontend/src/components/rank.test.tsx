import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RankTag } from './rank'

// The colours are CSS (rank-fill, which low-contrast rank colours tint); this checks who gets it.
describe('RankTag', () => {
  it('fills ranks 2–500 with the rank fill, and gives a world record its glow instead', () => {
    const { rerender } = render(<RankTag rank={5} />)
    expect(screen.getByText('5')).toHaveClass('rank-fill')
    rerender(<RankTag rank={1} />)
    const wr = screen.getByRole('img', { name: 'World record (rank 1)' }).parentElement!
    expect(wr).toHaveClass('wr-glow')
    expect(wr).not.toHaveClass('rank-fill')
  })
})
