import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { adaptChangelog } from '@/lib/adapters/runs'
import { api, type QueryParams } from '@/lib/api-client'
import { gameIdParam, isMultiplayerMode, type Catalog } from '@/lib/catalog'
import { queryKeys } from '@/lib/query-keys'
import type { BannedFilter } from '@/lib/run-filters'
import type { ChangelogRaw, Run } from '@/types/runs'

// The changelog (score updates, a map's chamber history, a player's runs on a map). Shared:
// Score Updates, the map page, profiles and the run history dialog all list it.

export interface ChangelogFilters {
  game?: string
  /** Player name search. */
  search?: string
  profileNumber?: string
  mapId?: string
  limit?: number
  /** A board key: "sp" / "coop" filter on the server; other boards (Mel's) are filtered here. */
  mode?: string
  /** Only runs that took the world record. */
  wr?: boolean
  /** Only runs with a YouTube video. */
  video?: boolean
  /** Only runs with a demo. */
  demo?: boolean
  /** Only runs waiting for verification. */
  pending?: boolean
  banned?: BannedFilter
  /** Only runs that ranked this high or better when they were set. */
  rank?: string | number
  /** Only runs from the last this many days. */
  days?: string | number
}

const toggle = (on: boolean | undefined) => (on ? true : undefined)

/** GET /changelog parameters for the filters (legacy fetchChangelog). */
export function changelogParams(f: ChangelogFilters, c: Catalog): QueryParams {
  const multiplayer = f.mode ? isMultiplayerMode(c, f.mode) : undefined
  const banned = f.banned ?? 'hide'
  return {
    limit: f.limit ?? 200,
    nick_name: f.search || undefined,
    profile_number: f.profileNumber,
    chamber: f.mapId,
    sp: multiplayer ? false : undefined,
    coop: multiplayer === false ? false : multiplayer ? true : undefined,
    wr_gain: toggle(f.wr),
    yt: toggle(f.video),
    has_demo: toggle(f.demo),
    verified: f.pending ? false : undefined,
    banned: banned === 'only' ? true : banned === 'show' ? undefined : false,
    max_rank: f.rank || undefined,
    since_days: f.days || undefined,
    ...gameIdParam(c, f.game ?? 'portal2'),
  }
}

export async function getChangelog(f: ChangelogFilters, c: Catalog, signal?: AbortSignal): Promise<Run[]> {
  return (await getChangelogPage(f, c, undefined, signal)).runs
}

/** One page of the changelog: its runs, and the cursor for the next page (null at the end). */
export interface ChangelogPage {
  runs: Run[]
  next: number | null
}

/**
 * The runs listed after the run `before` (by id; the first page without it), `f.limit` of them.
 * The next page starts after the last row the server sent, even when Mel's board filtering below
 * leaves fewer (or none) of them.
 */
export async function getChangelogPage(
  f: ChangelogFilters,
  c: Catalog,
  before: number | undefined,
  signal?: AbortSignal,
): Promise<ChangelogPage> {
  const game = f.game ?? 'portal2'
  const rows = await api.get<ChangelogRaw[]>('/changelog', {
    params: { ...changelogParams(f, c), before },
    signal,
  })
  const all = rows.map((r) => adaptChangelog(r, game, c))
  // The server filters single player / co-op; Mel's boards are told apart by their maps.
  const runs = f.mode && f.mode !== 'sp' && f.mode !== 'coop' ? all.filter((r) => r.map.mode === f.mode) : all
  // A full page may have more after it.
  const next = rows.length >= (f.limit ?? 200) ? rows[rows.length - 1]!.id : null
  return { runs, next }
}

export const changelogQueryOptions = (f: ChangelogFilters, c: Catalog) =>
  queryOptions({
    // The catalog's origin is in the key: maps in the rows come from it.
    queryKey: [...queryKeys.changelog(f.game ?? 'portal2', { ...f }), c.fromServer],
    queryFn: ({ signal }) => getChangelog(f, c, signal),
  })

/** The changelog page by page (Score Updates' endless list), under the same key prefix, so the
 *  same invalidations refresh it. */
export const changelogPagesQueryOptions = (f: ChangelogFilters, c: Catalog) =>
  infiniteQueryOptions({
    queryKey: [...queryKeys.changelog(f.game ?? 'portal2', { ...f }), c.fromServer, 'pages'],
    queryFn: ({ pageParam, signal }) => getChangelogPage(f, c, pageParam, signal),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.next ?? undefined,
  })
