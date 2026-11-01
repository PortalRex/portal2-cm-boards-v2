import { useState } from 'react'
import { useLoadMore } from './use-load-more'

/** An infinite query's paging, for lists that also fetch older pages ([useEndlessRows]). */
export interface EndlessPages {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isFetchNextPageError: boolean
  fetchNextPage: () => unknown
  /** Pages loaded so far. */
  loaded: number
}

/** An infinite query's state as [EndlessPages]. */
export const endlessPages = (
  q: Omit<EndlessPages, 'loaded'> & { data?: { pages: unknown[] } },
): EndlessPages => ({
  hasNextPage: q.hasNextPage,
  isFetchingNextPage: q.isFetchingNextPage,
  isFetchNextPageError: q.isFetchNextPageError,
  fetchNextPage: q.fetchNextPage,
  loaded: q.data?.pages.length ?? 0,
})

/**
 * A list that grows as it's scrolled: `step` rows at first and `step` more each time its end
 * (`end`, a ref for the element under the rows) comes near; once the loaded rows are all shown,
 * the next of `pages` is fetched. A new `resetKey` (other filters, another search) starts again
 * from the top; `showAtLeast` shows enough rows to reach a given one.
 */
export function useEndlessRows<T>({
  rows,
  resetKey,
  step,
  pages,
}: {
  rows: T[]
  resetKey: string
  step: number
  pages?: EndlessPages
}) {
  const [shown, setShown] = useState({ key: resetKey, count: step })
  const count = shown.key === resetKey ? shown.count : step
  if (shown.key !== resetKey) setShown({ key: resetKey, count: step })
  const visible = rows.slice(0, count)
  const hasMore = visible.length < rows.length || Boolean(pages?.hasNextPage)
  const end = useLoadMore({
    hasMore: hasMore && !pages?.isFetchingNextPage && !pages?.isFetchNextPageError,
    progress: `${visible.length}/${pages?.loaded ?? 0}`,
    onMore: () => {
      // The loaded rows first, then the next page.
      if (visible.length < rows.length) setShown({ key: resetKey, count: count + step })
      else void pages?.fetchNextPage()
    },
  })
  /** Shows rows up to the `n`th (for the list under `key`, when it's about to change). */
  const showAtLeast = (n: number, key = resetKey) =>
    setShown({ key, count: Math.max(key === resetKey ? count : step, Math.ceil(n / step) * step) })
  return { visible, hasMore, end, showAtLeast }
}
