// Tables sorted by a header click: the column's natural order first (most first for counts and
// lengths, fastest first for times, A–Z for names), then reversed, then back to the table's own.

/** A table's order: by a column, its natural way unless reversed. */
export interface TableSort {
  key: string
  reversed: boolean
}

/** A sortable column: what it sorts by (null: no value, always last) and which way comes first. */
export interface SortColumn<T> {
  value: (row: T) => number | string | null | undefined
  first: 'asc' | 'desc'
}

/** A header click: the column's natural order, then reversed, then back to the table's own. */
export function nextSort(key: string, current: TableSort | null): TableSort | null {
  if (current?.key !== key) return { key, reversed: false }
  return current.reversed ? null : { key, reversed: true }
}

/** The rows in the sort's order (stable: equal values keep the table's own order). */
export function sortRows<T>(rows: T[], columns: Record<string, SortColumn<T>>, sort: TableSort | null): T[] {
  const column = sort && columns[sort.key]
  if (!column) return rows
  const sign = (column.first === 'desc') !== sort.reversed ? -1 : 1
  const keyed = rows.map((row, i) => ({ row, i, v: column.value(row) }))
  keyed.sort((a, b) => {
    const empty = Number(a.v == null) - Number(b.v == null)
    if (empty || a.v == null || b.v == null) return empty || a.i - b.i
    const order =
      typeof a.v === 'string' && typeof b.v === 'string'
        ? a.v.localeCompare(b.v, undefined, { sensitivity: 'base', numeric: true })
        : Number(a.v) - Number(b.v)
    return sign * order || a.i - b.i
  })
  return keyed.map((k) => k.row)
}
