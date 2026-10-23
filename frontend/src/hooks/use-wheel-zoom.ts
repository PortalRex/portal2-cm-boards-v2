import { useEffect, useRef, useState } from 'react'

const DAY = 24 * 3600 * 1000

/**
 * Scroll-wheel zoom over a chart's time axis. Returns [domain, ref, reset]: `domain` is the zoomed
 * [from, to], or null when showing all of `full`; put `ref` on the element around the chart. Zooms
 * around the pointer; `left` / `right` are the pixels beside the plot area (axes, margins).
 */
export function useWheelZoom(
  full: [number, number] | null,
  { left = 0, right = 0, minSpan = 7 * DAY }: { left?: number; right?: number; minSpan?: number } = {},
): [[number, number] | null, (el: HTMLElement | null) => void, () => void] {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [domain, setDomain] = useState<[number, number] | null>(null)
  const fullRef = useRef(full)
  useEffect(() => {
    fullRef.current = full
  })

  useEffect(() => {
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const [f0, f1] = fullRef.current ?? [0, 0]
      if (!(f1 > f0)) return
      // The page doesn't scroll while the pointer is over the chart.
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const frac = Math.min(
        1,
        Math.max(0, (e.clientX - rect.left - left) / Math.max(1, rect.width - left - right)),
      )
      setDomain((d) => {
        const [a, b] = d ?? [f0, f1]
        const at = a + (b - a) * frac
        const span = Math.max(minSpan, (b - a) * (e.deltaY < 0 ? 0.8 : 1.25))
        if (span >= f1 - f0) return null
        let from = at - span * frac
        let to = from + span
        if (from < f0) [from, to] = [f0, f0 + span]
        if (to > f1) [from, to] = [f1 - span, f1]
        return [from, to]
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [el, left, right, minSpan])

  return [domain, setEl, () => setDomain(null)]
}
