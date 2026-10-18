import { describe, expect, it } from 'vitest'
import {
  fromInput,
  gameModes,
  modeKey,
  modeName,
  moveChapter,
  moveMap,
  slugify,
  toInput,
} from './catalog-editor'

describe('games editor helpers', () => {
  it('makes link names and mode keys from names', () => {
    expect(slugify('  Portal 2: Speedrun Mod!! ')).toBe('portal-2-speedrun-mod')
    expect(slugify('x'.repeat(40))).toHaveLength(32)
    expect(modeKey('No Hair Mode')).toBe('no_hair_mode')
    expect(modeKey('--Advanced--')).toBe('advanced')
  })

  it('turns stored UTC times into datetime-local values and back', () => {
    expect(toInput('2026-10-01T09:30:00')).toBe('2026-10-01T09:30')
    expect(toInput(null)).toBe('')
    expect(fromInput('2026-10-01T09:30')).toBe('2026-10-01T09:30:00')
    expect(fromInput('')).toBeNull()
  })

  it('lists a game’s modes: the chapters’ ones and named ones without chapters', () => {
    const game = {
      chapters: [{ game_mode: 'sp' }, { game_mode: 'coop' }, { game_mode: 'sp' }] as never,
      mode_names: { sp: 'Story', bonus: 'Bonus' },
    }
    expect(gameModes(game)).toEqual(['sp', 'coop', 'bonus'])
    expect(modeName(game, 'sp')).toBe('Story')
    expect(modeName(game, 'coop')).toBe('Cooperative')
  })

  const layout = [
    { id: 1, maps: ['a', 'b'] },
    { id: 2, maps: ['c'] },
    { id: 3, maps: ['x'] },
  ]
  const multiplayer = (id: number) => id === 3

  it('moves a map into another chapter, before a map or at the end', () => {
    expect(moveMap(layout, multiplayer, 'a', 2, 'c')).toEqual([
      { id: 1, maps: ['b'] },
      { id: 2, maps: ['a', 'c'] },
      { id: 3, maps: ['x'] },
    ])
    expect(moveMap(layout, multiplayer, 'a', 2, null)[1]).toEqual({ id: 2, maps: ['c', 'a'] })
    expect(moveMap(layout, multiplayer, 'b', 1, 'a')[0]).toEqual({ id: 1, maps: ['b', 'a'] })
  })

  it('keeps single player and co-op maps in their kind of chapter', () => {
    expect(moveMap(layout, multiplayer, 'a', 3, null)).toBe(layout)
  })

  it('moves chapters up and down within the list', () => {
    expect(moveChapter(layout, 0, 1).map((c) => c.id)).toEqual([2, 1, 3])
    expect(moveChapter(layout, 2, -1).map((c) => c.id)).toEqual([1, 3, 2])
    expect(moveChapter(layout, 0, -1).map((c) => c.id)).toEqual([1, 2, 3])
  })
})
