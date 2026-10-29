import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Bubble } from './bubble'

describe('Bubble', () => {
  afterEach(() => vi.restoreAllMocks())

  it('moves in from the side of the window to stay whole, its arrow still on the point', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(400)
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(300)
    render(<Bubble at={{ x: 380, y: 100 }}>Overall points count from Expert up</Bubble>)
    const bubble = screen.getByRole('tooltip')
    // 300px wide: its middle can be no further right than 400 - 150 - 8.
    expect(bubble.style.left).toBe('242px')
    expect(bubble.style.getPropertyValue('--arrow-x')).toBe('138px')
  })

  it('stays centred on the point away from the sides', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1000)
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(300)
    render(<Bubble at={{ x: 500, y: 100 }}>A comment</Bubble>)
    expect(screen.getByRole('tooltip').style.left).toBe('500px')
  })
})
