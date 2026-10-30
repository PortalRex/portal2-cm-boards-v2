import { cn } from 'cn'
import type { ReactNode } from 'react'
import { SortDownIcon, SortUpIcon } from '@/components/icons'
import { nextSort, type SortColumn, type TableSort } from '@/lib/table-sort'

/**
 * A column header that sorts its table: a click orders by the column, again the other way, a third
 * time back to the table's own order. The arrow shows which way the column's values go.
 */
export function SortHeader({
  sortKey,
  first,
  sort,
  onSort,
  className,
  children,
}: {
  sortKey: string
  /** Which way the column's first click orders it. */
  first: SortColumn<unknown>['first']
  sort: TableSort | null
  onSort: (sort: TableSort | null) => void
  className?: string
  children: ReactNode
}) {
  const on = sort?.key === sortKey ? sort : null
  const descending = on && (first === 'desc') !== on.reversed
  const Arrow = descending ? SortDownIcon : SortUpIcon
  return (
    <span
      role="columnheader"
      className={className}
      aria-sort={on ? (descending ? 'descending' : 'ascending') : 'none'}
    >
      <button
        type="button"
        className={cn(
          'inline-flex cursor-pointer items-center gap-0.5 border-0 bg-transparent p-0 text-inherit uppercase hover:text-foreground',
          on && 'text-foreground',
        )}
        onClick={() => onSort(nextSort(sortKey, sort))}
      >
        {on && <Arrow className="size-3.5" aria-hidden />}
        {children}
      </button>
    </span>
  )
}
