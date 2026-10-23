// Scrolls the page so `el` is centred, on an S-curve (starts slow, speeds up, eases in) rather
// than the browser's own smooth scroll. Longer trips take a little longer, within limits. A
// wheel, touch or key from the viewer stops it; with reduced motion it jumps.
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

const STOP_EVENTS = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const

let cancelCurrent: (() => void) | null = null

/** How long a scroll of `distance` pixels takes (ms). */
export const scrollDuration = (distance: number) =>
  Math.min(1100, Math.max(450, 300 + Math.abs(distance) * 0.4))

export function scrollToCentre(el: Element | null | undefined): void {
  if (!el) return
  cancelCurrent?.()
  const rect = el.getBoundingClientRect()
  const maxY = document.documentElement.scrollHeight - window.innerHeight
  const from = window.scrollY
  const to = Math.max(
    0,
    Math.min(maxY, from + rect.top - (window.innerHeight - Math.min(rect.height, window.innerHeight)) / 2),
  )
  const distance = to - from
  if (Math.abs(distance) < 2) return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    window.scrollTo(0, to)
    return
  }
  const duration = scrollDuration(distance)
  const start = performance.now()
  let frame = 0
  const stop = () => {
    cancelAnimationFrame(frame)
    for (const e of STOP_EVENTS) window.removeEventListener(e, stop)
    cancelCurrent = null
  }
  for (const e of STOP_EVENTS) window.addEventListener(e, stop, { passive: true })
  cancelCurrent = stop
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration)
    window.scrollTo(0, from + distance * easeInOutCubic(t))
    if (t < 1) frame = requestAnimationFrame(step)
    else stop()
  }
  frame = requestAnimationFrame(step)
}
