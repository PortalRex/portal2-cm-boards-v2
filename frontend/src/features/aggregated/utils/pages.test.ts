import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG, buildCatalog, type CatalogRaw } from '@/lib/catalog'
import catalogRaw from '@/testing/fixtures/catalog.json'
import { boardTabs, builtInTarget, DEFAULT_KICKER, seasonKicker } from './pages'

const catalog = buildCatalog(catalogRaw as CatalogRaw)
const SEASON = 'portal-2-season-1'

describe('builtInTarget', () => {
  it("opens Portal 2's and Mel's all-time boards", () => {
    expect(builtInTarget(catalog, 'portal2', 'sp', undefined)).toEqual({
      view: {
        game: 'portal2',
        kind: 'sp',
        title: 'Single Player',
        kicker: DEFAULT_KICKER,
        season: null,
        board: { game: 'portal2', board: 'sp' },
      },
    })
    expect(builtInTarget(catalog, 'mel', 'advanced', undefined)).toMatchObject({
      view: { title: 'Advanced Mode', board: { game: 'mel', board: 'advanced' } },
    })
  })

  it("sends an unknown board to the game's overall board", () => {
    expect(builtInTarget(catalog, 'portal2', 'story', undefined)).toEqual({
      redirect: '/leaderboard/overall',
    })
    expect(builtInTarget(catalog, 'mel', 'sp', undefined)).toEqual({ redirect: '/leaderboard/mel/overall' })
  })

  it("reads the season's copy of the board, with the season's dates as the kicker", () => {
    expect(builtInTarget(catalog, 'portal2', 'coop', SEASON)).toEqual({
      view: {
        game: 'portal2',
        kind: 'coop',
        title: 'Cooperative',
        kicker: 'Portal 2 Season 1 · 2026-10-15 – 2026-10-30',
        season: SEASON,
        board: { game: SEASON, board: `${SEASON}-coop` },
      },
    })
    expect(builtInTarget(catalog, 'portal2', 'overall', SEASON)).toMatchObject({
      view: { board: { game: SEASON, board: 'overall' } },
    })
  })

  it('ignores a season of another game, and has no board when the season lacks one', () => {
    expect(builtInTarget(catalog, 'mel', 'story', SEASON)).toMatchObject({ view: { season: null } })
    const noCoop = buildCatalog(
      (catalogRaw as CatalogRaw).map((g) =>
        g.slug === SEASON ? { ...g, chapters: g.chapters.filter((ch) => ch.game_mode !== 'coop') } : g,
      ),
    )
    expect(builtInTarget(noCoop, 'portal2', 'coop', SEASON)).toMatchObject({
      view: { season: SEASON, board: null },
    })
  })

  it('opens the running season for "season", or says there is none', () => {
    expect(builtInTarget(catalog, 'portal2', 'season', undefined)).toEqual({
      redirect: `/leaderboard/overall?season=${SEASON}`,
    })
    expect(builtInTarget(BUILTIN_CATALOG, 'portal2', 'season', undefined)).toEqual({ noSeason: true })
  })
})

describe('seasonKicker', () => {
  it('says "ongoing" for a season without an end', () => {
    const open = buildCatalog(
      (catalogRaw as CatalogRaw).map((g) => (g.slug === SEASON ? { ...g, ends_at: null } : g)),
    )
    expect(seasonKicker(open, SEASON)).toBe('Portal 2 Season 1 · 2026-10-15 – ongoing')
  })
})

describe('boardTabs', () => {
  it("lists the built-in games' boards at their old addresses", () => {
    expect(boardTabs(catalog, 'portal2')).toEqual({
      label: 'Portal 2 boards',
      items: [
        { kind: 'overall', label: 'Overall', path: '/leaderboard/overall' },
        { kind: 'sp', label: 'Single Player', path: '/leaderboard/sp' },
        { kind: 'coop', label: 'Cooperative', path: '/leaderboard/coop' },
      ],
    })
    expect(boardTabs(catalog, 'mel')?.items.map((t) => t.path)).toEqual([
      '/leaderboard/mel/overall',
      '/leaderboard/mel/story',
      '/leaderboard/mel/advanced',
    ])
  })

  it("lists a custom game's overall board and modes", () => {
    expect(boardTabs(catalog, 'custom-game')).toEqual({
      label: 'Custom Game boards',
      items: [
        { kind: 'overall', label: 'Overall', path: '/leaderboard/game/custom-game/overall' },
        {
          kind: 'custom-game-sp',
          label: expect.any(String) as unknown,
          path: '/leaderboard/game/custom-game/custom-game-sp',
        },
      ],
    })
    expect(boardTabs(catalog, 'nope')).toBeNull()
  })
})
