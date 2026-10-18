import { z } from 'zod'
import type { ChangelogFilters } from '@/lib/runs/changelog'
import {
  BANNED_OPTIONS,
  RANK_OPTIONS,
  RUN_LIMITS,
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
  limit: text,
  banned: text,
  page: text,
  wr: text,
  video: text,
  demo: text,
  pending: text,
  rank: text,
  days: text,
})

export type ScoreUpdatesSearch = z.infer<typeof scoreUpdatesSearchSchema>

export const DEFAULTS = { mode: '', map: '', q: '', limit: '200', banned: 'hide', page: '0' } as const

export interface ScoreFilters {
  mode: string
  mapId: string
  q: string
  limit: string
  wr: boolean
  video: boolean
  demo: boolean
  pending: boolean
  banned: BannedFilter
  rank: string
  days: string
  page: number
}

const oneOf = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback

/** The filters a URL asks for, with anything invalid back at its default. */
export function readFilters(search: ScoreUpdatesSearch, modes: string[]): ScoreFilters {
  return {
    mode: modes.includes(search.mode ?? '') ? search.mode! : '',
    mapId: search.map ?? '',
    q: search.q ?? '',
    limit: oneOf(search.limit, RUN_LIMITS, DEFAULTS.limit),
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
    page: Math.max(0, Number(search.page) || 0),
  }
}

export type FilterChanges = Partial<Record<keyof ScoreUpdatesSearch, string | boolean | undefined>>

/** The URL's search after `changes` (any change goes back to page 1 unless it sets the page). */
export function applyFilterChanges(prev: ScoreUpdatesSearch, changes: FilterChanges): ScoreUpdatesSearch {
  const next: Record<string, unknown> = { ...prev }
  for (const [k, v] of Object.entries({ page: undefined, ...changes })) {
    const def = DEFAULTS[k as keyof typeof DEFAULTS]
    if (v == null || v === '' || v === false || v === def) delete next[k]
    else next[k] = v === true ? '1' : v
  }
  return next as ScoreUpdatesSearch
}

/** What the server is asked for (the search box is debounced separately). */
export const changelogFilters = (f: ScoreFilters, game: string, query: string): ChangelogFilters => ({
  game,
  mode: f.mode || undefined,
  mapId: f.mapId || undefined,
  limit: Number(f.limit),
  wr: f.wr,
  video: f.video,
  demo: f.demo,
  pending: f.pending,
  banned: f.banned,
  rank: f.rank,
  days: f.days,
  search: query,
})

/** Filters folded behind "More filters" on phones that aren't at their default. */
export const extraFilterCount = (f: ScoreFilters) =>
  RUN_TOGGLES.filter(([k]) => f[k as RunToggle]).length +
  Number(Boolean(f.rank)) +
  Number(Boolean(f.days)) +
  Number(f.banned !== DEFAULTS.banned) +
  Number(f.limit !== DEFAULTS.limit)

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
  wr: false,
  video: false,
  demo: false,
  pending: false,
  banned: 'hide',
  rank: '',
  days: '',
}
