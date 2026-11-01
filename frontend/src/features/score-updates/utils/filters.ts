import { z } from 'zod'
import type { ChangelogFilters } from '@/lib/runs/changelog'
import {
  BANNED_OPTIONS,
  RANK_OPTIONS,
  RUN_TOGGLES,
  TIME_OPTIONS,
  type BannedFilter,
  type RunToggle,
} from '@/lib/run-filters'

// Score Updates' filters live in the URL so a filtered feed can be shared or bookmarked
// (legacy useFilters): defaults are left out, toggles are "1", and other parameters (?game=,
// ?season=) are kept.

const text = z.string().optional().catch(undefined)

export const scoreUpdatesSearchSchema = z.looseObject({
  mode: text,
  map: text,
  q: text,
  /** A player picked from the search box's suggestions (Steam id): only their runs. */
  player: text,
  banned: text,
  wr: text,
  video: text,
  demo: text,
  pending: text,
  rank: text,
  days: text,
})

export type ScoreUpdatesSearch = z.infer<typeof scoreUpdatesSearchSchema>

export const DEFAULTS = {
  mode: '',
  map: '',
  q: '',
  player: '',
  banned: 'hide',
} as const

export interface ScoreFilters {
  mode: string
  mapId: string
  q: string
  player: string
  wr: boolean
  video: boolean
  demo: boolean
  pending: boolean
  banned: BannedFilter
  rank: string
  days: string
}

const oneOf = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback

/** The filters a URL asks for, with anything invalid back at its default. */
export function readFilters(search: ScoreUpdatesSearch, modes: string[]): ScoreFilters {
  return {
    mode: modes.includes(search.mode ?? '') ? search.mode! : '',
    mapId: search.map ?? '',
    q: search.q ?? '',
    player: search.player ?? '',
    wr: search.wr === '1',
    video: search.video === '1',
    demo: search.demo === '1',
    pending: search.pending === '1',
    banned: oneOf(
      search.banned,
      BANNED_OPTIONS.map((o) => o.value),
      'hide',
    ),
    rank: oneOf(
      search.rank,
      RANK_OPTIONS.map((o) => o.value),
      '',
    ),
    days: oneOf(
      search.days,
      TIME_OPTIONS.map((o) => o.value),
      '',
    ),
  }
}

export type FilterChanges = Partial<Record<keyof ScoreUpdatesSearch, string | boolean | undefined>>

/** The URL's search after `changes`. A `page` or `limit` from before the list scrolled endlessly
 *  (old links) goes too. */
export function applyFilterChanges(prev: ScoreUpdatesSearch, changes: FilterChanges): ScoreUpdatesSearch {
  const next: Record<string, unknown> = { ...prev }
  delete next.page
  delete next.limit
  for (const [k, v] of Object.entries(changes)) {
    const def = DEFAULTS[k as keyof typeof DEFAULTS]
    if (v == null || v === '' || v === false || v === def) delete next[k]
    else next[k] = v === true ? '1' : v
  }
  return next as ScoreUpdatesSearch
}

// Runs fetched at a time; the list fetches the next ones as it scrolls.
const PAGE_RUNS = 200

/** What the server is asked for (the search box is debounced separately). */
export const changelogFilters = (f: ScoreFilters, game: string, query: string): ChangelogFilters => ({
  game,
  mode: f.mode || undefined,
  mapId: f.mapId || undefined,
  limit: PAGE_RUNS,
  wr: f.wr,
  video: f.video,
  demo: f.demo,
  pending: f.pending,
  banned: f.banned,
  rank: f.rank,
  days: f.days,
  // A picked player is matched by Steam id; otherwise the box searches names.
  profileNumber: f.player || undefined,
  search: f.player ? '' : query,
})

/** Filters folded behind "More filters" on phones that aren't at their default. */
export const extraFilterCount = (f: ScoreFilters) =>
  RUN_TOGGLES.filter(([k]) => f[k as RunToggle]).length +
  Number(Boolean(f.rank)) +
  Number(Boolean(f.days)) +
  Number(f.banned !== DEFAULTS.banned)

/** Whether anything narrows the feed (shows "Clear filters"). */
export const isFiltered = (f: ScoreFilters, query: string) =>
  Boolean(
    f.mapId ||
    f.mode ||
    f.rank ||
    f.days ||
    f.wr ||
    f.video ||
    f.demo ||
    f.pending ||
    f.banned !== 'hide' ||
    query,
  )

export const CLEARED: FilterChanges = {
  mode: '',
  map: '',
  q: '',
  player: '',
  wr: false,
  video: false,
  demo: false,
  pending: false,
  banned: 'hide',
  rank: '',
  days: '',
}
