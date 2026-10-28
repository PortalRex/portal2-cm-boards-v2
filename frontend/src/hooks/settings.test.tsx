import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCollapsed, useCollapsedGroup } from './use-collapsed'
import { useCoopPbStyle } from './use-coop-pb-style'
import { useFollows } from './use-follows'
import { useTheme } from './use-theme'

describe('useTheme', () => {
  it('is dark by default and applies light to <html>', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBeUndefined()
    act(() => result.current.toggleTheme())
    expect(result.current.theme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('p2cm.theme')).toBe('light')
    act(() => result.current.toggleTheme())
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(localStorage.getItem('p2cm.theme')).toBe('dark')
  })

  it('opens with a theme saved by the legacy site', () => {
    localStorage.setItem('p2cm.theme', 'light')
    expect(renderHook(() => useTheme()).result.current.theme).toBe('light')
  })
})

describe('useCoopPbStyle', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('defaults to the coloured name on phones, the trophy elsewhere, until one is picked', () => {
    const screenIs = (phone: boolean) =>
      vi.stubGlobal('matchMedia', (q: string) => ({ matches: phone && q.includes('max-width'), media: q }))
    screenIs(true)
    expect(renderHook(() => useCoopPbStyle()).result.current[0]).toBe('border')
    screenIs(false)
    expect(renderHook(() => useCoopPbStyle()).result.current[0]).toBe('icon')
    // Picked: it stays, phone or not.
    localStorage.setItem('p2cm.coopPbStyle', 'icon')
    screenIs(true)
    expect(renderHook(() => useCoopPbStyle()).result.current[0]).toBe('icon')
  })

  it('defaults to the trophy, reads the legacy value and syncs every user', () => {
    localStorage.setItem('p2cm.coopPbStyle', 'border')
    const a = renderHook(() => useCoopPbStyle())
    const b = renderHook(() => useCoopPbStyle())
    expect(a.result.current[0]).toBe('border')
    act(() => a.result.current[1]('icon'))
    expect(b.result.current[0]).toBe('icon')
    localStorage.setItem('p2cm.coopPbStyle', 'weird')
    expect(renderHook(() => useCoopPbStyle()).result.current[0]).toBe('icon')
  })
})

describe('useCollapsed', () => {
  it('toggles one card and remembers it in the legacy format', () => {
    localStorage.setItem('p2cm.collapsed', '["recap"]')
    const { result } = renderHook(() => useCollapsed('graph'))
    expect(result.current[0]).toBe(false)
    act(() => result.current[1]())
    expect(result.current[0]).toBe(true)
    expect(JSON.parse(localStorage.getItem('p2cm.collapsed')!)).toEqual(['recap', 'graph'])
  })

  it("can't collapse without an id", () => {
    const { result } = renderHook(() => useCollapsed(null))
    act(() => result.current[1]())
    expect(result.current[0]).toBe(false)
    expect(localStorage.getItem('p2cm.collapsed')).toBeNull()
  })

  it('collapses a group, or opens it when all are collapsed', () => {
    const group = renderHook(() => useCollapsedGroup(['a', 'b']))
    const a = renderHook(() => useCollapsed('a'))
    act(() => a.result.current[1]())
    expect(group.result.current[0]).toBe(false)
    act(() => group.result.current[1]())
    expect(group.result.current[0]).toBe(true)
    act(() => group.result.current[1]())
    expect(group.result.current[0]).toBe(false)
    expect(a.result.current[0]).toBe(false)
  })
})

describe('useFollows', () => {
  const player = { profileNumber: '76561198000000001', name: 'Runner', avatar: 'https://avatars/a.jpg' }

  it('reads follows saved by the legacy site, skipping broken entries', () => {
    localStorage.setItem('p2cm.follows', JSON.stringify([player, null, { name: 'no id' }]))
    const { result } = renderHook(() => useFollows())
    expect(result.current.follows).toEqual([player])
    expect(result.current.isFollowing(player.profileNumber)).toBe(true)
  })

  it('follows and unfollows', () => {
    const { result } = renderHook(() => useFollows())
    act(() => result.current.toggleFollow({ profileNumber: '1', name: 'A' }))
    expect(result.current.follows).toEqual([{ profileNumber: '1', name: 'A', avatar: null }])
    expect(JSON.parse(localStorage.getItem('p2cm.follows')!)).toEqual([
      { profileNumber: '1', name: 'A', avatar: null },
    ])
    act(() => result.current.toggleFollow({ profileNumber: '1', name: 'A' }))
    expect(result.current.follows).toEqual([])
  })
})
