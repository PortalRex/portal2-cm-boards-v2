import { describe, expect, it } from 'vitest'
import { keyFile } from './key-file'

describe('keyFile', () => {
  it('has both games on the boards’ own address, as SAR reads it', () =>
    expect(keyFile('abc123', 'board.portal2.sr')).toBe('board.portal2.sr\nabc123\nmel.portal2.sr\nabc123\n'))

  it('uses this site’s address elsewhere', () =>
    expect(keyFile('abc123', 'dev.portal2.jonesy.moe')).toBe('dev.portal2.jonesy.moe\nabc123\n'))
})
