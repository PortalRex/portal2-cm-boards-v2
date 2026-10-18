import {
  currentSeason,
  gameBoardPath,
  gameBoardsPath,
  MEL,
  modeLabel,
  PORTAL2,
  seasonBoard,
  seasonFor,
  withSeason,
  type Catalog,
} from '@/lib/catalog'
import type { BoardRef } from '../types'

/** What an aggregated page shows. */
export interface AggregatedView {
  /** The game whose boards the tabs and the season picker belong to. */
  game: string
  /** The open tab: "overall" or a board key. */
  kind: string
  title: string
  kicker: string
  season: string | null
  /** The board to load; null when the picked season has no such board. */
  board: BoardRef | null
}

export type AggregatedTarget = { view: AggregatedView } | { redirect: string } | { noSeason: true }

export const DEFAULT_KICKER = 'Aggregated points and times'

/** The built-in games' tabs: route segment -> title. */
export const BUILT_IN_KINDS: Record<string, Record<string, string>> = {
  [PORTAL2]: { overall: 'Overall', sp: 'Single Player', coop: 'Cooperative' },
  [MEL]: { overall: 'Overall', story: 'Story Mode', advanced: 'Advanced Mode' },
}

// Season dates are UTC; shown as entered.
export function seasonKicker(c: Catalog, season: string): string {
  const g = c.games[season]
  if (!g) return season
  const day = (ts: string) => ts.slice(0, 10)
  return g.startsAt ? `${g.label} · ${day(g.startsAt)} – ${g.endsAt ? day(g.endsAt) : 'ongoing'}` : g.label
}

/** One of `game`'s boards, all-time or in the picked season (if it's one of the game's). */
function boardView(
  c: Catalog,
  game: string,
  kind: string,
  title: string,
  picked: string | null | undefined,
  kicker = DEFAULT_KICKER,
): AggregatedTarget {
  const season = seasonFor(c, game, picked)
  if (!season) return { view: { game, kind, title, kicker, season: null, board: { game, board: kind } } }
  const board = seasonBoard(c, season, game, kind)
  return {
    view: {
      game,
      kind,
      title,
      kicker: seasonKicker(c, season),
      season,
      board: board ? { game: season, board } : null,
    },
  }
}

/** /leaderboard/{kind} and /leaderboard/mel/{kind}; "season" opens the running season. */
export function builtInTarget(
  c: Catalog,
  game: string,
  kind: string,
  picked: string | null | undefined,
): AggregatedTarget {
  if (kind === 'season') {
    const season = currentSeason(c)
    return season?.base
      ? { redirect: withSeason(gameBoardsPath(season.base), season.id) }
      : { noSeason: true }
  }
  const title = BUILT_IN_KINDS[game]?.[kind]
  if (!title) return { redirect: gameBoardsPath(game) }
  return boardView(c, game, kind, title, picked)
}

export interface BoardTabs {
  label: string
  items: { kind: string; label: string; path: string }[]
}

/** The tabs under a board's title: the game's overall board and one per mode. */
export function boardTabs(c: Catalog, game: string): BoardTabs | null {
  const builtIn = BUILT_IN_KINDS[game]
  if (builtIn) {
    return {
      label: game === PORTAL2 ? 'Portal 2 boards' : 'Mel boards',
      items: Object.entries(builtIn).map(([kind, label]) => ({
        kind,
        label,
        path: gameBoardPath(game, kind),
      })),
    }
  }
  const g = c.games[game]
  if (!g) return null
  return {
    label: `${g.label} boards`,
    items: ['overall', ...g.modes].map((kind) => ({
      kind,
      label: kind === 'overall' ? 'Overall' : modeLabel(c, kind),
      path: gameBoardPath(game, kind),
    })),
  }
}
