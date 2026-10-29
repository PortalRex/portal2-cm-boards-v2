import { useEffect, useState } from 'react'

/**
 * An element's width, kept up to date as it resizes (0 until measured, or where the browser can't
 * watch sizes). Returns the ref to put on the element.
 */
export function useWidth(): [(el: HTMLElement | null) => void, number] {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [el])
  return [setEl, width]
}
