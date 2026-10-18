// Filter options shared by Score Updates and a map's Chamber History.
export const RUN_LIMITS = ['100', '200', '500'] as const
export type RunLimit = (typeof RUN_LIMITS)[number]

export const RUN_TOGGLES = [
  ['wr', 'World records'],
  ['video', 'Has video'],
  ['demo', 'Has demo'],
  ['pending', 'Pending'],
] as const
export type RunToggle = (typeof RUN_TOGGLES)[number][0]

export interface FilterOption {
  value: string
  label: string
}

/** Rank the run reached when it was set. */
export const RANK_OPTIONS: FilterOption[] = [
  { value: '', label: 'Any rank' },
  ...['10', '25', '50', '100', '200'].map((n) => ({ value: n, label: `Top ${n}` })),
]

/** How recent it is (days). */
export const TIME_OPTIONS: FilterOption[] = [
  { value: '', label: 'Any time' },
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '365', label: 'Last year' },
]

export const BANNED_OPTIONS = [
  { value: 'hide', label: 'Hide banned' },
  { value: 'show', label: 'Include banned' },
  { value: 'only', label: 'Only banned' },
] as const
export type BannedFilter = (typeof BANNED_OPTIONS)[number]['value']
