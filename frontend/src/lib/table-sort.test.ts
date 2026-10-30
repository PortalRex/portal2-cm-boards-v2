import { describe, expect, it } from 'vitest'
import { nextSort, sortRows, type SortColumn } from './table-sort'

interface Row {
  name: string
  time: number | null
}
const rows: Row[] = [
  { name: 'b', time: 30 },
  { name: 'A', time: null },
  { name: 'c', time: 10 },
  { name: 'd', time: 30 },
]
const columns: Record<string, SortColumn<Row>> = {
  name: { value: (r) => r.name, first: 'asc' },
  time: { value: (r) => r.time, first: 'desc' },
}
const names = (list: Row[]) => list.map((r) => r.name)

describe('nextSort', () => {
  it('sorts by a column, then the other way, then not at all', () => {
    expect(nextSort('time', null)).toEqual({ key: 'time', reversed: false })
    expect(nextSort('time', { key: 'time', reversed: false })).toEqual({ key: 'time', reversed: true })
    expect(nextSort('time', { key: 'time', reversed: true })).toBeNull()
    expect(nextSort('name', { key: 'time', reversed: true })).toEqual({ key: 'name', reversed: false })
  })
})

describe('sortRows', () => {
  it("keeps the table's own order unsorted", () => {
    expect(sortRows(rows, columns, null)).toBe(rows)
  })

  it('orders by the column its first way, ties in table order, rows without a value last', () => {
    expect(names(sortRows(rows, columns, { key: 'time', reversed: false }))).toEqual(['b', 'd', 'c', 'A'])
    expect(names(sortRows(rows, columns, { key: 'time', reversed: true }))).toEqual(['c', 'b', 'd', 'A'])
  })

  it('sorts names A to Z, whatever their case', () => {
    expect(names(sortRows(rows, columns, { key: 'name', reversed: false }))).toEqual(['A', 'b', 'c', 'd'])
  })
})
