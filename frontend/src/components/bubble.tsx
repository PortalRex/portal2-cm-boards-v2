import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * A speech bubble above a point on the page (comments, hover labels). It goes on the page body: a
 * row's hover filter would otherwise pin a fixed bubble to the row, and cards would clip it.
 */
export function Bubble({ at, children }: { at: { x: number; y: number }; children: ReactNode }) {
  return createPortal(
    <span
      role="tooltip"
      style={{ left: at.x, top: at.y }}
      className="pointer-events-none fixed z-[1100] w-max max-w-[min(320px,80vw)] -translate-x-1/2 translate-y-[calc(-100%-8px)] rounded-md border border-line bg-menu px-[11px] py-[7px] text-sm leading-[1.35] font-normal [overflow-wrap:anywhere] whitespace-normal text-foreground not-italic shadow-[0_6px_18px_rgb(0_0_0/35%)] after:absolute after:-bottom-1.5 after:left-1/2 after:size-2.5 after:-translate-x-1/2 after:rotate-45 after:border-r after:border-b after:border-line after:bg-menu after:content-['']"
    >
      {children}
    </span>,
    document.body,
  )
}
