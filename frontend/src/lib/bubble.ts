/** Where a bubble points: centred over an element, kept inside the window (`half`: half its width). */
export function bubbleAnchor(el: Element | null | undefined, half: number): { x: number; y: number } | null {
  const r = el?.getBoundingClientRect()
  if (!r) return null
  return { x: Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8), y: r.top }
}
