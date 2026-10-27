import { MEL, modeLabel, PORTAL2, type Catalog } from '@/lib/catalog'
import type { PointsBoard } from '@/lib/data/roles'
import type { Run } from '@/types/runs'
import type { AggregateRowRaw, GameResults, MapScore, PointsBoardKey, Profile, ScoreBrief } from '../types'

/**
 * One of the three boards the profile's top cards show: a game's first and second boards (Portal
 * 2's single player and co-op, Mel's Story and Advanced) in the `sp` and `coop` slots, and overall.
 */
export interface Slot {
  key: PointsBoardKey
  /** The board's mode in the catalog (none for overall). */
  mode: string | null
  /** The board's name in the server's points answers (`sp`, `story`, ... `overall`). */
  serverKey: string
  label: string
  short: string
  /** Portal 2's boards have community roles with points thresholds. */
  roleBoard: PointsBoard | null
  /** The board's page, opened on a player. */
  href: (profileNumber: string) => string
}

/** What the profile's top cards show for one game. */
export interface ProfileSummary {
  slots: Slot[]
  points: Partial<Record<PointsBoardKey, number>>
  place: Partial<Record<PointsBoardKey, number | null>>
  /** Place in the player's country (Portal 2's overall board only). */
  countryPlace: number | null
  averagePlace: Partial<Record<PointsBoardKey, number | null>>
  worldRecords: Partial<Record<PointsBoardKey, number>>
  newest: ScoreBrief | null
  oldest: ScoreBrief | null
  best: MapScore | null
  worst: MapScore | null
}

/** Where a game's board is: Portal 2's and Mel's at their own addresses, other games' under /game. */
export function boardPath(game: string, board: string): string {
  if (game === PORTAL2) return `/leaderboard/${board}`
  if (game === MEL) return `/leaderboard/mel/${board}`
  return `/leaderboard/game/${game}/${board}`
}

/** A board's name as the server gives it (the catalog prefixes a custom game's modes). */
export const serverMode = (game: string, mode: string) =>
  mode.startsWith(`${game}-`) ? mode.slice(game.length + 1) : mode

const P2_SLOTS: Omit<Slot, 'href'>[] = [
  { key: 'sp', mode: 'sp', serverKey: 'sp', label: 'Singleplayer', short: 'Single Player', roleBoard: 'sp' },
  {
    key: 'coop',
    mode: 'coop',
    serverKey: 'coop',
    label: 'Cooperative',
    short: 'Cooperative',
    roleBoard: 'coop',
  },
  {
    key: 'overall',
    mode: null,
    serverKey: 'overall',
    label: 'Overall',
    short: 'Overall',
    roleBoard: 'overall',
  },
]

/** A game's slots: Portal 2's three boards, or another game's first two boards and overall. */
export function gameSlots(c: Catalog, game: string): Slot[] {
  const href = (board: string) => (pn: string) => `${boardPath(game, board)}?player=${pn}`
  if (game === PORTAL2) return P2_SLOTS.map((s) => ({ ...s, href: href(s.serverKey) }))
  const modes = (c.games[game]?.modes ?? []).slice(0, 2)
  const keys: PointsBoardKey[] = ['sp', 'coop']
  return [
    ...modes.map((mode, i) => {
      const label = modeLabel(c, mode)
      return {
        key: keys[i]!,
        mode,
        serverKey: serverMode(game, mode),
        label,
        short: label,
        roleBoard: null,
        href: href(mode),
      }
    }),
    {
      key: 'overall',
      mode: null,
      serverKey: 'overall',
      label: 'Overall',
      short: 'Overall',
      roleBoard: null,
      href: href('overall'),
    },
  ]
}

/** Portal 2's summary, from the profile (as it is, or as it was on a past day). */
export function p2Summary(c: Catalog, p: Profile): ProfileSummary {
  return {
    slots: gameSlots(c, PORTAL2),
    points: p.points,
    place: { sp: p.globalRank.sp, coop: p.globalRank.coop, overall: p.globalRank.overall },
    countryPlace: p.globalRank.country,
    averagePlace: p.averagePlace,
    worldRecords: {
      sp: p.worldRecords.sp,
      coop: p.worldRecords.coop,
      overall: p.worldRecords.sp + p.worldRecords.coop,
    },
    newest: p.newest,
    oldest: p.oldest,
    best: p.best,
    worst: p.worst,
  }
}

const time = (t: string | null | undefined) => (t ? Date.parse(t.endsWith('Z') ? t : `${t}Z`) : 0)

/**
 * Another game's summary: points and places from its aggregated boards (GET /profile/aggregated),
 * the rest from the player's best times and runs in it.
 */
export function gameSummary(
  c: Catalog,
  game: string,
  rows: AggregateRowRaw[],
  results: GameResults,
): ProfileSummary {
  const slots = gameSlots(c, game)
  const byBoard = new Map(rows.map((r) => [r.board, r]))
  const ranked = Object.values(results.scores).filter((s): s is MapScore & { rank: number } => s.rank != null)
  const inSlot = (slot: Slot) => ranked.filter((s) => slot.mode == null || s.map.mode === slot.mode)
  const points: ProfileSummary['points'] = {}
  const place: ProfileSummary['place'] = {}
  const averagePlace: ProfileSummary['averagePlace'] = {}
  const worldRecords: ProfileSummary['worldRecords'] = {}
  for (const slot of slots) {
    const row = byBoard.get(slot.serverKey)
    points[slot.key] = row?.points?.value ?? 0
    place[slot.key] = row?.points?.rank ?? null
    const list = inSlot(slot)
    averagePlace[slot.key] = list.length ? list.reduce((a, s) => a + s.rank, 0) / list.length : null
    worldRecords[slot.key] = list.filter((s) => s.rank === 1).length
  }
  const dated = results.history
    .filter((h: Run) => h.timestamp && !h.banned)
    .sort((a, b) => time(a.timestamp) - time(b.timestamp))
  const brief = (h: Run | undefined): ScoreBrief | null =>
    h ? { map: h.map, score: h.score, timestamp: h.timestamp } : null
  const sorted = [...ranked].sort((a, b) => a.rank - b.rank)
  return {
    slots,
    points,
    place,
    countryPlace: null,
    averagePlace,
    worldRecords,
    newest: brief(dated[dated.length - 1]),
    oldest: brief(dated[0]),
    best: sorted[0] ?? null,
    worst: sorted[sorted.length - 1] ?? null,
  }
}

/** A server answer per board (`story`, ... `overall`) moved onto the game's slots. */
export function toSlots<T>(
  slots: Slot[],
  byServerKey: Record<string, T | undefined>,
): Partial<Record<PointsBoardKey, T>> {
  const out: Partial<Record<PointsBoardKey, T>> = {}
  for (const s of slots) {
    const v = byServerKey[s.serverKey]
    if (v !== undefined) out[s.key] = v
  }
  return out
}
