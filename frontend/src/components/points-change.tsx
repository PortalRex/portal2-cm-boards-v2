import { cn } from 'cn'
import { useRef, useState } from 'react'
import { bubbleAnchor } from '@/lib/bubble'
import { Bubble } from './bubble'
import { TriangleDown, TriangleUp } from './icons'

/**
 * A green arrow up or red arrow down for points gained or lost lately, saying how many in a bubble
 * on hover (or focus), and beside it with `showAmount` (whole points; tenths under one).
 */
export function PointsChange({
  change,
  days,
  showAmount = false,
  size = 10,
  className,
}: {
  change: number | null | undefined
  days: number
  showAmount?: boolean
  /** The arrow's size in pixels. */
  size?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  if (!change) return null
  const Arrow = change > 0 ? TriangleUp : TriangleDown
  const sign = change > 0 ? '+' : ''
  const amount = Number.isInteger(change) ? change : change.toFixed(1)
  const text = `${sign}${amount} point${Math.abs(change) === 1 ? '' : 's'} in the last ${days} days`
  const shown = Math.abs(change) < 1 ? change.toFixed(1) : String(Math.round(change))
  const show = () => setAt(bubbleAnchor(ref.current))
  return (
    <span
      ref={ref}
      // Just an arrow: focusable, so its bubble can be read from the keyboard too.
      tabIndex={showAmount ? undefined : 0}
      onMouseEnter={show}
      onMouseLeave={() => setAt(null)}
      onFocus={show}
      onBlur={() => setAt(null)}
      className={cn(
        'inline-flex items-center gap-0.5 align-[-1px] outline-none',
        showAmount ? 'num shrink-0 text-sm font-normal' : 'mr-1',
        change > 0 ? 'text-green' : 'text-destructive',
        className,
      )}
    >
      <Arrow size={size} role="img" aria-label={text} />
      {showAmount && (
        <span aria-hidden>
          {sign}
          {shown}
        </span>
      )}
      {at && <Bubble at={at}>{text}</Bubble>}
    </span>
  )
}
