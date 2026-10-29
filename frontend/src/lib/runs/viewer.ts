/**
 * The demo viewer's link for a run: its first demo opened, the rest (a co-op partner's) with it.
 * The viewer downloads them from /demos/{id}/file by these ids. Null without a demo.
 */
export function viewerUrl(demoIds: readonly (number | null | undefined)[]): string | null {
  const ids = [...new Set(demoIds.filter((id): id is number => Boolean(id)))]
  if (!ids.length) return null
  const [first, ...rest] = ids
  return `/viewer/#board=${first}${rest.length ? `&with=${rest.join(',')}` : ''}`
}
