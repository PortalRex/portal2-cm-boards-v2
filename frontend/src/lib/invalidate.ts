import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from './query-keys'

// The one place that knows what a change to a run or a player affects. Every staff action,
// reaction, submission and report calls these after it succeeds. Only queries on screen refetch
// straight away; the rest are marked stale and refetch when next used.

export interface RunChange {
  changelogId?: number | null
  /** The run's co-op bundle, when it has one. */
  coopId?: number | null
  /** The players whose profiles show the run. */
  profileNumbers?: (string | null | undefined)[]
}

// Linked leaderboards and seasons copy a run onto other maps (database triggers), and points
// move for everyone on the map, so a run's change reaches every board, ranking and stats page.
const RUN_WIDE = [
  ['changelog'],
  ['map-board'],
  ['map-previews'],
  ['wr-history'],
  ['aggregated'],
  ['recap'],
  ['daily'],
  ['activity'],
  ['following-feed'],
  ['stats'],
  ['countries'],
  ['compare'],
] as const

export async function invalidateRun(
  qc: QueryClient,
  { changelogId, coopId, profileNumbers = [] }: RunChange,
) {
  const keys: readonly (readonly unknown[])[] = [
    ...RUN_WIDE,
    ...(changelogId != null ? [queryKeys.run(changelogId)] : []),
    ...(coopId != null ? [queryKeys.coopHalves(coopId)] : []),
    ...profileNumbers.filter((p): p is string => Boolean(p)).map((p) => queryKeys.profile(p)),
  ]
  await Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })))
}

/** After a player's name, picture, country, role, ban or freeze changes. */
export async function invalidateUser(qc: QueryClient, profileNumber: string) {
  const keys: readonly (readonly unknown[])[] = [
    queryKeys.profile(profileNumber),
    queryKeys.user(profileNumber),
    // Names and pictures show on every list; a ban hides the player's runs.
    ['changelog'],
    ['map-board'],
    ['map-previews'],
    ['wr-history'],
    ['aggregated'],
    ['recap'],
    ['daily'],
    ['following-feed'],
    ['stats'],
    ['countries'],
    ['compare'],
    queryKeys.wallOfShame(),
    // The About page's team (a staff tier, name or picture changed).
    queryKeys.staff(),
    queryKeys.me(),
  ]
  await Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })))
}
