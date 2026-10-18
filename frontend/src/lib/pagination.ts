/** The page buttons to show: a window of four around `page` (0-based). */
export function pageWindow(page: number, pageCount: number): { pages: number[]; more: boolean } {
  const start = Math.max(0, Math.min(page - 1, pageCount - 4))
  const pages: number[] = []
  for (let i = start; i < Math.min(pageCount, start + 4); i++) pages.push(i)
  return { pages, more: start + 4 < pageCount }
}
