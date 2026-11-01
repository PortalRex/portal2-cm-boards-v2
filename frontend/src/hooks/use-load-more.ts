import { useEffect, useRef, useState } from 'react'

/**
 * Infinite lists: give the returned ref to an element under the list, and `onMore` is called when
 * it comes within `margin` of the viewport while `hasMore`. It's watched again whenever `progress`
 * changes (rows shown, pages loaded), so a list still too short to reach the bottom keeps growing.
 */
export function useLoadMore({
  hasMore,
  onMore,
  progress,
  margin = '600px',
}: {
  hasMore: boolean
  onMore: () => void
  progress: number | string
  margin?: string
}): (el: Element | null) => void {
  const [el, setEl] = useState<Element | null>(null)
  const more = useRef(onMore)
  useEffect(() => {
    more.current = onMore
  })
  useEffect(() => {
    if (!el || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) more.current()
      },
      { rootMargin: `${margin} 0px` },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [el, hasMore, progress, margin])
  return setEl
}
