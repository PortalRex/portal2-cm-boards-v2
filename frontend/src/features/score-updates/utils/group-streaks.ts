import { parseTimestamp } from '@/lib/format'
import type { ScoreUpdate } from './merge-coop-halves'

/** PBs closer together than this, one after another, are one session. */
export const STREAK_GAP_MS = 3 * 3600 * 1000

/** A score update with the earlier PBs of its session folded under it, newest first. */
export type StreakUpdate = ScoreUpdate & { earlier: ScoreUpdate[] }

const time = (e: ScoreUpdate) => (e.timestamp ? parseTimestamp(e.timestamp).getTime() : NaN)
// The same player (or co-op pair) on the same map.
const streakKey = (e: ScoreUpdate) =>
  `${e.game}|${e.map.id}|${e.players
    .map((p) => p.profileNumber ?? p.name)
    .sort()
    .join('&')}`

/**
 * Folds a player's (or co-op pair's) run of PBs on one map into the newest of them, so a session
 * of improvements is one row: each earlier PB joins when it's within `gap` of the one after it,
 * even with other players' updates in between. Banned and undated runs stay on their own.
 * `entries` are newest first.
 */
export function groupStreaks(entries: ScoreUpdate[], gap = STREAK_GAP_MS): StreakUpdate[] {
  const out: StreakUpdate[] = []
  const sessions = new Map<string, StreakUpdate>()
  for (const e of entries) {
    const t = time(e)
    if (e.banned || Number.isNaN(t)) {
      out.push({ ...e, earlier: [] })
      continue
    }
    const key = streakKey(e)
    const session = sessions.get(key)
    const oldest = session ? (session.earlier[session.earlier.length - 1] ?? session) : undefined
    if (session && oldest && time(oldest) - t <= gap) {
      session.earlier.push(e)
      continue
    }
    const fresh: StreakUpdate = { ...e, earlier: [] }
    sessions.set(key, fresh)
    out.push(fresh)
  }
  return out
}

/** Adds up what's known: null when none of them is. */
const total = (values: (number | null)[]) =>
  values.some((v) => v != null) ? values.reduce<number>((sum, v) => sum + (v ?? 0), 0) : null

/**
 * A session as a whole: the rank before its first PB, and the time and points all its PBs
 * gained together.
 */
export function streakSummary(s: StreakUpdate): {
  preRank: number | null
  scoreDelta: number | null
  pointsDelta: number | null
} {
  const all = [s, ...s.earlier]
  return {
    preRank: all[all.length - 1]!.preRank,
    scoreDelta: total(all.map((e) => e.scoreDelta)),
    pointsDelta: total(all.map((e) => e.pointsDelta)),
  }
}
