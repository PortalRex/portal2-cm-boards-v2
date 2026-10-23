import type { MouseEvent } from 'react'

/**
 * Click handler for a row that expands: toggles unless the click landed on a link, button or form
 * control inside the row (those keep their own behaviour), or text is being selected.
 */
export const toggleOnRowClick = (toggle: () => void) => (e: MouseEvent) => {
  if ((e.target as Element).closest('a, button, input, select, textarea, video')) return
  if (window.getSelection?.()?.toString()) return
  toggle()
}
