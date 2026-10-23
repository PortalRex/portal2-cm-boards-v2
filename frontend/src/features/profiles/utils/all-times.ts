import type { Run } from '@/types/runs'

/** How the profile's full list of times is ordered. */
export type TimesSort = 'newest' | 'oldest' | 'rank' | 'improvement' | 'map'

export const TIMES_SORTS: { value: TimesSort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'rank', label: 'Best rank' },
  { value: 'improvement', label: 'Biggest improvement' },
  { value: 'map', label: 'Map order' },
]

export type TimesMode = 'all' | 'sp' | 'coop'

const time = (r: Run) => (r.timestamp ? Date.parse(r.timestamp) : null)

/** Newest first, undated runs (old imports) last; ties by id, newest first. */
const byNewest = (a: Run, b: Run) => {
  const ta = time(a)
  const tb = time(b)
  if (ta === tb) return b.id - a.id
  if (ta === null) return 1
  if (tb === null) return -1
  return tb - ta
}

/** Oldest first, undated runs last (they have no place in time). */
const byOldest = (a: Run, b: Run) => {
  const ta = time(a)
  const tb = time(b)
  if (ta === tb) return a.id - b.id
  if (ta === null) return 1
  if (tb === null) return -1
  return ta - tb
}

/** Runs without the value go last, then newest first among equals. */
const nullsLast = (a: number | null, b: number | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a - b

/**
 * The runs in `sort` order. `mapOrder` gives each map's place in its game (map id → index), for
 * "Map order"; within a map, newest first.
 */
export function sortTimes(runs: Run[], sort: TimesSort, mapOrder: Map<string, number>): Run[] {
  const list = [...runs]
  switch (sort) {
    case 'newest':
      return list.sort(byNewest)
    case 'oldest':
      return list.sort(byOldest)
    case 'rank':
      return list.sort((a, b) => nullsLast(a.postRank, b.postRank) || byNewest(a, b))
    case 'improvement':
      // Most time taken off first (the most negative delta); first times have none.
      return list.sort((a, b) => nullsLast(a.scoreDelta, b.scoreDelta) || byNewest(a, b))
    case 'map':
      return list.sort(
        (a, b) =>
          (mapOrder.get(a.map.id) ?? Number.MAX_SAFE_INTEGER) -
            (mapOrder.get(b.map.id) ?? Number.MAX_SAFE_INTEGER) || byNewest(a, b),
      )
  }
}

/** The runs on single player or co-op maps (`coopModes`: the co-op board keys), and whose map title has `query`. */
export function filterTimes(
  runs: Run[],
  mode: TimesMode,
  query: string,
  coopModes: ReadonlySet<string>,
): Run[] {
  const q = query.trim().toLowerCase()
  return runs.filter((r) => {
    const coop = coopModes.has(r.map.mode)
    if (mode === 'sp' && coop) return false
    if (mode === 'coop' && !coop) return false
    return !q || r.map.title.toLowerCase().includes(q)
  })
}
