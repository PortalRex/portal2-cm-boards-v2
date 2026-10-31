import { afterEach, describe, expect, it, vi } from 'vitest'
import { readJson, readStorage, STORAGE_KEYS, subscribeStorage, writeStorage } from './storage'

describe('storage', () => {
  afterEach(() => vi.restoreAllMocks())

  it("keeps the legacy keys, plus the new site's own", () => {
    expect(STORAGE_KEYS).toEqual({
      game: 'p2cm.game',
      theme: 'p2cm.theme',
      viewAsPlayer: 'p2cm.viewAsPlayer',
      coopPbStyle: 'p2cm.coopPbStyle',
      collapsed: 'p2cm.collapsed',
      follows: 'p2cm.follows',
      glass: 'p2cm.glass',
      background: 'p2cm.background',
    })
  })

  it('writes, removes and tells subscribers of the same key', () => {
    const onTheme = vi.fn()
    const onGame = vi.fn()
    const stop = subscribeStorage('p2cm.theme', onTheme)
    subscribeStorage('p2cm.game', onGame)()
    writeStorage('p2cm.theme', 'light')
    expect(localStorage.getItem('p2cm.theme')).toBe('light')
    writeStorage('p2cm.theme', null)
    expect(localStorage.getItem('p2cm.theme')).toBeNull()
    expect(onTheme).toHaveBeenCalledTimes(2)
    expect(onGame).not.toHaveBeenCalled()
    stop()
  })

  it('hears changes from other tabs', () => {
    const onChange = vi.fn()
    subscribeStorage('p2cm.follows', onChange)
    window.dispatchEvent(new StorageEvent('storage', { key: 'p2cm.follows' }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'p2cm.other' }))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('keeps the value for this page view when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(readStorage('p2cm.theme')).toBeNull()
    writeStorage('p2cm.theme', 'light')
    expect(readStorage('p2cm.theme')).toBe('light')
  })

  it('reads JSON with a fallback', () => {
    localStorage.setItem('p2cm.collapsed', '["a"]')
    expect(readJson('p2cm.collapsed', [])).toEqual(['a'])
    localStorage.setItem('p2cm.collapsed', '{broken')
    expect(readJson('p2cm.collapsed', [])).toEqual([])
    expect(readJson('p2cm.missing', 5)).toBe(5)
  })
})
