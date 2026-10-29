/** Where a bubble points: the middle of an element's top ([Bubble] keeps itself inside the window). */
export function bubbleAnchor(el: Element | null | undefined): { x: number; y: number } | null {
  const r = el?.getBoundingClientRect()
  if (!r) return null
  return { x: r.left + r.width / 2, y: r.top }
}
