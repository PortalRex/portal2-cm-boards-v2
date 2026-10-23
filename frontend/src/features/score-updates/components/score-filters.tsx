import { cn } from 'cn'
import { useState } from 'react'
import { TriangleDown } from '@/components/icons'
import { Segmented } from '@/components/segmented'
import { Select } from '@/components/select'
import { mapsForMode, modeLabel, useCatalog } from '@/lib/catalog'
import { BANNED_OPTIONS, RANK_OPTIONS, RUN_LIMITS, RUN_TOGGLES, TIME_OPTIONS } from '@/lib/run-filters'
import {
  CLEARED,
  extraFilterCount,
  isFiltered,
  type FilterChanges,
  type ScoreFilters as Filters,
} from '../utils/filters'

const selectClass = 'min-w-[150px] upto900:w-full upto900:min-w-0'

export function ScoreFilters({
  filters,
  query,
  modes,
  set,
}: {
  filters: Filters
  query: string
  modes: string[]
  set: (changes: FilterChanges) => void
}) {
  const catalog = useCatalog()
  const [moreOpen, setMoreOpen] = useState(false)
  const maps = (filters.mode ? [filters.mode] : modes).flatMap((m) => mapsForMode(catalog, m))
  const extra = extraFilterCount(filters)

  return (
    <div
      role="group"
      aria-label="Filters"
      className="-mt-1.5 mb-[22px] flex flex-wrap items-center gap-x-3 gap-y-2.5 upto900:m-0 upto900:mb-4 upto900:grid upto900:grid-cols-[minmax(0,1fr)] upto900:gap-2.5"
    >
      <Segmented
        size="md"
        value={filters.mode}
        onChange={(m) => set({ mode: m, map: '' })}
        label="Board"
        className="upto900:w-full"
        itemClassName="upto900:flex-1 upto900:px-1.5 upto900:text-[15px] upto700:px-3"
        options={[
          { value: '', label: 'All' },
          ...modes.map((m) => ({ value: m, label: modeLabel(catalog, m) })),
        ]}
      />
      <Select
        value={filters.mapId}
        onChange={(v) => set({ map: v })}
        label="Chamber"
        size="md"
        className={cn(selectClass, 'min-w-[220px]')}
        options={[
          { value: '', label: 'All chambers' },
          ...maps.map((m) => ({ value: m.id, label: m.title })),
        ]}
      />
      {/* Phones: the rest folds behind this button (wide screens show it all inline). */}
      <button
        type="button"
        aria-expanded={moreOpen}
        onClick={() => setMoreOpen((o) => !o)}
        className="hidden h-8 cursor-pointer items-center justify-center gap-2 rounded-md border border-line bg-control text-[15px] text-foreground upto900:flex"
      >
        More filters
        {extra > 0 && (
          <span className="num min-w-5 rounded-[10px] bg-brand px-1.5 text-[13px] leading-5 text-white">
            {extra}
          </span>
        )}
        <TriangleDown size={12} className={cn('transition-transform', moreOpen && 'rotate-180')} />
      </button>
      <div
        className={cn(
          'contents',
          'upto900:hidden',
          moreOpen && 'upto900:grid upto900:grid-cols-2 upto900:gap-2',
        )}
      >
        {RUN_TOGGLES.map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={filters[k]}
            onClick={() => set({ [k]: !filters[k] })}
            className={cn(
              'h-8 cursor-pointer rounded-2xl border border-line bg-control px-3.5 text-[15px] text-text-2 hover:border-line-strong upto900:px-2',
              filters[k] && 'border-brand bg-brand text-white',
            )}
          >
            {label}
          </button>
        ))}
        <Select
          value={filters.rank}
          onChange={(v) => set({ rank: v })}
          options={RANK_OPTIONS}
          label="Rank"
          size="md"
          className={cn(selectClass, 'min-w-[124px]')}
        />
        <Select
          value={filters.days}
          onChange={(v) => set({ days: v })}
          options={TIME_OPTIONS}
          label="Time"
          size="md"
          className={cn(selectClass, 'min-w-[124px]')}
        />
        <Select
          value={filters.banned}
          onChange={(v) => set({ banned: v })}
          options={[...BANNED_OPTIONS]}
          label="Banned runs"
          size="md"
          className={selectClass}
        />
        <Select
          value={filters.limit}
          onChange={(v) => set({ limit: v })}
          options={RUN_LIMITS.map((l) => ({ value: l, label: `Latest ${l}` }))}
          label="Number of runs"
          size="md"
          className={cn(selectClass, 'min-w-[124px]')}
        />
      </div>
      {isFiltered(filters, query) && (
        <button
          type="button"
          onClick={() => set(CLEARED)}
          className="ml-auto cursor-pointer border-0 bg-transparent px-1.5 py-px text-[15px] text-brand-light hover:underline upto900:m-0 upto900:justify-self-center"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
