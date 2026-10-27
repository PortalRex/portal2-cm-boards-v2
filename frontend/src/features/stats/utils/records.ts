export type RecordOrder = 'map' | 'longest' | 'shortest'

/** The Records table's orders: the game's map order, or by how long each record has stood. */
export const RECORD_ORDERS: { value: RecordOrder; label: string }[] = [
  { value: 'map', label: 'Map order' },
  { value: 'longest', label: 'Longest standing' },
  { value: 'shortest', label: 'Shortest standing' },
]

/** Records in the chosen order; records that have stood equally long keep map order. */
export function orderRecords<T extends { days: number }>(rows: T[], order: RecordOrder): T[] {
  if (order === 'map') return rows
  const sign = order === 'longest' ? -1 : 1
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => sign * (a.r.days - b.r.days) || a.i - b.i)
    .map(({ r }) => r)
}
