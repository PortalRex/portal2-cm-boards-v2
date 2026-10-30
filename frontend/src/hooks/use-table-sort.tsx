import { useMemo, useState, type ReactNode } from 'react'
import { SortHeader } from '@/components/sort-header'
import { sortRows, type SortColumn, type TableSort } from '@/lib/table-sort'

/**
 * A table sorted by its column headers. `rows` in the table's own order; `columns` by key, plus
 * "rank": the rows' places in that order (their #). Gives the rows in the picked order, each row's
 * place in the table's own order, and a header for a column.
 */
export function useTableSort<T>(rows: T[], columns: Record<string, SortColumn<T>>) {
  const [sort, setSort] = useState<TableSort | null>(null)
  const ranks = useMemo(() => new Map(rows.map((row, i) => [row, i + 1])), [rows])
  const rankOf = (row: T) => ranks.get(row) ?? 0
  const all: Record<string, SortColumn<T>> = { rank: { value: rankOf, first: 'asc' }, ...columns }
  const header = (key: string, label: ReactNode, className?: string) => (
    <SortHeader sortKey={key} first={all[key]!.first} sort={sort} onSort={setSort} className={className}>
      {label}
    </SortHeader>
  )
  return { rows: sortRows(rows, all, sort), rankOf, header }
}
