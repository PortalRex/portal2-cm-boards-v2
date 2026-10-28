import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

const DAY = 24 * 3600 * 1000

type Domain = [number, number]

/** `[from, to]` of length `span` moved inside `full`; null when it covers all of `full`. */
export function fitDomain([f0, f1]: Domain, from: number, span: number): Domain | null {
  if (span >= f1 - f0) return null
  const start = Math.min(Math.max(from, f0), f1 - span)
  return [start, start + span]
}

/**
 * The view zoomed in (or out) around the point `frac` (0-1) of the way across it, keeping that
 * point under the pointer. `domain` null is all of `full`; so is the result when it zooms out to it.
 */
export function zoomDomain(
  domain: Domain | null,
  full: Domain,
  frac: number,
  zoomIn: boolean,
  minSpan = 7 * DAY,
): Domain | null {
  const [a, b] = domain ?? full
  const at = a + (b - a) * frac
  const span = Math.max(minSpan, (b - a) * (zoomIn ? 0.8 : 1.25))
  return fitDomain(full, at - span * frac, span)
}

/** The view moved by `by` ms (later when positive), stopping at the ends of `full`. */
export function panDomain(domain: Domain | null, full: Domain, by: number): Domain | null {
  if (!domain) return null
  return fitDomain(full, domain[0] + by, domain[1] - domain[0])
}

/**
 * The view moved just far enough to show `t` when it's outside it, with `t` a `margin` (a fraction
 * of the view) in from the edge it came in at. A view already showing `t` stays as it is.
 */
export function revealDomain(domain: Domain | null, full: Domain, t: number, margin = 0.1): Domain | null {
  if (!domain) return null
  const [a, b] = domain
  const span = b - a
  if (t < a) return fitDomain(full, t - span * margin, span)
  if (t > b) return fitDomain(full, t - span * (1 - margin), span)
  return domain
}

/**
 * Scroll-wheel zoom on an element around a chart, feeding `setDomain`. Returns the ref to put on the
 * element. Zooms around the pointer; `left` / `right` are the pixels beside the plot area (axes,
 * margins).
 */
export function useWheelZoomOn(
  full: Domain | null,
  setDomain: Dispatch<SetStateAction<Domain | null>>,
  { left = 0, right = 0, minSpan = 7 * DAY }: { left?: number; right?: number; minSpan?: number } = {},
): (el: HTMLElement | null) => void {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const fullRef = useRef(full)
  useEffect(() => {
    fullRef.current = full
  })

  useEffect(() => {
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const full = fullRef.current
      if (!full || !(full[1] > full[0])) return
      // The page doesn't scroll while the pointer is over the chart.
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const frac = Math.min(
        1,
        Math.max(0, (e.clientX - rect.left - left) / Math.max(1, rect.width - left - right)),
      )
      setDomain((d) => zoomDomain(d, full, frac, e.deltaY < 0, minSpan))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [el, left, right, minSpan, setDomain])

  return setEl
}

/**
 * Scroll-wheel zoom over a chart's time axis. Returns [domain, ref, reset]: `domain` is the zoomed
 * [from, to], or null when showing all of `full`; put `ref` on the element around the chart. Zooms
 * around the pointer; `left` / `right` are the pixels beside the plot area (axes, margins).
 */
export function useWheelZoom(
  full: Domain | null,
  options: { left?: number; right?: number; minSpan?: number } = {},
): [Domain | null, (el: HTMLElement | null) => void, () => void] {
  const [domain, setDomain] = useState<Domain | null>(null)
  const ref = useWheelZoomOn(full, setDomain, options)
  return [domain, ref, () => setDomain(null)]
}
