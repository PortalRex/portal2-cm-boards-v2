import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG, buildCatalog, type CatalogRaw } from '@/lib/catalog'
import raw from '@/testing/fixtures/catalog.json'
import { aggregateMenu, isHere, isNavActive, MORE_MENU, NAV, pathForGame } from './nav-model'

const catalog = buildCatalog(raw as CatalogRaw)
const S1 = 'portal-2-season-1'
const during = Date.parse('2026-10-20T12:00:00Z')
const after = Date.parse('2026-11-05T00:00:00Z')

describe('aggregateMenu', () => {
  it('lists Portal 2 boards with chapters, then the running season and the seasons', () => {
    const menu = aggregateMenu(catalog, 'portal2', during)
    expect(menu.map((b) => b.label)).toEqual([
      'Overall',
      'Single Player',
      'Cooperative',
      'Current season',
      'Seasons',
    ])
    const sp = menu[1]!
    expect(sp.to).toBe('/leaderboard/sp')
    expect(sp.chapters!.slice(0, 2)).toEqual([
      { number: 1, label: 'The Courtesy Call', to: '/leaderboard/chapter/7' },
      { number: 2, label: 'The Cold Boot', to: '/leaderboard/chapter/8' },
    ])
    expect(menu[2]!.chapters![0]).toEqual({ number: 1, label: 'Team Building', to: '/leaderboard/chapter/1' })
    expect(menu[3]).toMatchObject({ highlight: true, to: `/leaderboard/overall?season=${S1}` })
    expect(menu[4]).toMatchObject({ noTotal: true, chapters: [{ label: 'Portal 2 Season 1' }] })
  })

  it('drops "Current season" once it has ended', () => {
    expect(aggregateMenu(catalog, 'portal2', after).map((b) => b.label)).toEqual([
      'Overall',
      'Single Player',
      'Cooperative',
      'Seasons',
    ])
  })

  it('lists Mel and custom games with their own boards', () => {
    expect(aggregateMenu(catalog, 'mel').map((b) => [b.label, b.to])).toEqual([
      ['Overall', '/leaderboard/mel/overall'],
      ['Story Mode', '/leaderboard/mel/story'],
      ['Advanced Mode', '/leaderboard/mel/advanced'],
    ])
    expect(aggregateMenu(catalog, 'custom-game').map((b) => [b.label, b.to])).toEqual([
      ['Overall', '/leaderboard/game/custom-game/overall'],
      ['Main Board', '/leaderboard/game/custom-game/custom-game-sp'],
    ])
  })

  it('falls back to Portal 2 for an unknown game, and works on the built-in lists', () => {
    expect(aggregateMenu(catalog, 'gone')[1]!.label).toBe('Single Player')
    expect(aggregateMenu(BUILTIN_CATALOG, 'portal2')).toHaveLength(3)
  })
})

describe('menu helpers', () => {
  it('knows the page you are on, season included', () => {
    expect(isHere('/leaderboard/sp', '/leaderboard/sp', '')).toBe(true)
    expect(isHere('/leaderboard/sp', '/leaderboard/sp', `?season=${S1}`)).toBe(false)
    expect(isHere(`/leaderboard/overall?season=${S1}`, '/leaderboard/overall', `?season=${S1}`)).toBe(true)
    expect(isHere('/leaderboard/sp', '/leaderboard/chapter/7', '', ['/leaderboard/chapter/7'])).toBe(true)
  })

  it('marks the active top-level item', () => {
    const [scoreUpdates, leaderboard, aggregate] = NAV
    expect(isNavActive(scoreUpdates!, '/')).toBe(true)
    expect(isNavActive(scoreUpdates!, '/maps')).toBe(false)
    expect(isNavActive(leaderboard!, '/map/sp/47458')).toBe(true)
    expect(isNavActive(aggregate!, '/leaderboard/mel/story')).toBe(true)
    expect(NAV.map((n) => n.label)).toEqual(['Score Updates', 'Leaderboard', 'Aggregate', 'Stats', 'More'])
    expect(MORE_MENU.map((m) => m.label)).toEqual(['Discord', 'GitHub', 'Donators', 'Wall Of Shame', 'About'])
  })

  it("sends a game switch to the new game's boards or map list, dropping the old game's filters", () => {
    expect(pathForGame('mel', '/leaderboard/sp', '')).toBe('/leaderboard/mel/overall')
    expect(pathForGame('custom-game', '/leaderboard/overall', '')).toBe(
      '/leaderboard/game/custom-game/overall',
    )
    expect(pathForGame('mel', '/map/sp/47458', '')).toBe('/maps')
    expect(pathForGame('mel', '/', '?mode=coop&limit=500&page=3')).toBe('/?limit=500')
    expect(pathForGame('mel', '/stats/records', `?season=${S1}`)).toBe('/stats/records')
  })
})
