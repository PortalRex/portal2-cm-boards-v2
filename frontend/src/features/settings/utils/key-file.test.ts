import { describe, expect, it } from 'vitest'
import { keyFile, keyFileName } from './key-file'

describe('keyFile', () => {
  it('has both games on the boards’ own address, as SAR reads it', () =>
    expect(keyFile('abc123', 'board.portal2.sr')).toBe('board.portal2.sr\nabc123\nmel.portal2.sr\nabc123\n'))

  it('uses this site’s address elsewhere', () =>
    expect(keyFile('abc123', 'dev.portal2.jonesy.moe')).toBe('dev.portal2.jonesy.moe\nabc123\n'))

  it('names the beta’s file apart from the boards’ own, so SAR keeps both', () => {
    expect(keyFileName('board.portal2.sr')).toBe('autosubmit.key')
    expect(keyFileName('preview.portal2.sr')).toBe('autosubmit_beta.key')
  })
})
