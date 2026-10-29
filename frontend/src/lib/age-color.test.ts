import { describe, expect, it } from 'vitest'
import { ageColor } from './age-color'

const now = Date.parse('2026-10-29T12:00:00Z')
const hoursAgo = (h: number) => new Date(now - h * 3600 * 1000)

describe('ageColor', () => {
  it("blends the old boards' shades by how long ago the run was set", () => {
    expect(ageColor(hoursAgo(0), now)).toBe('color-mix(in srgb, var(--age-1) 0%, var(--age-0))')
    expect(ageColor(hoursAgo(12), now)).toBe('color-mix(in srgb, var(--age-1) 50%, var(--age-0))')
    expect(ageColor(hoursAgo(24), now)).toBe('color-mix(in srgb, var(--age-1) 100%, var(--age-0))')
    // A week: half way from a day to two weeks.
    expect(ageColor(hoursAgo(7.5 * 24), now)).toBe('color-mix(in srgb, var(--age-2) 50%, var(--age-1))')
    expect(ageColor(hoursAgo(60 * 24), now)).toBe('color-mix(in srgb, var(--age-3) 100%, var(--age-2))')
  })

  it('leaves runs over two months old (and missing times) uncoloured', () => {
    expect(ageColor(hoursAgo(61 * 24), now)).toBeUndefined()
    expect(ageColor(null, now)).toBeUndefined()
  })

  it('counts a time in the future as new', () => {
    expect(ageColor(hoursAgo(-2), now)).toBe('color-mix(in srgb, var(--age-1) 0%, var(--age-0))')
  })
})
