import { cn } from 'cn'
import { TriangleDown, TriangleUp } from './icons'

/**
 * A green arrow up or red arrow down for points gained or lost lately, saying how many on hover,
 * and beside it with `showAmount` (whole points; tenths under one).
 */
export function PointsChange({
  change,
  days,
  showAmount = false,
}: {
  change: number | null | undefined
  days: number
  showAmount?: boolean
}) {
  if (!change) return null
  const Arrow = change > 0 ? TriangleUp : TriangleDown
  const sign = change > 0 ? '+' : ''
  const amount = Number.isInteger(change) ? change : change.toFixed(1)
  const text = `${sign}${amount} point${Math.abs(change) === 1 ? '' : 's'} in the last ${days} days`
  const shown = Math.abs(change) < 1 ? change.toFixed(1) : String(Math.round(change))
  return (
    <span
      title={text}
      className={cn(
        'inline-flex items-center gap-0.5 align-[-1px]',
        showAmount ? 'num shrink-0 text-sm font-normal' : 'mr-1',
        change > 0 ? 'text-green' : 'text-destructive',
      )}
    >
      <Arrow size={10} role="img" aria-label={text} />
      {showAmount && (
        <span aria-hidden>
          {sign}
          {shown}
        </span>
      )}
    </span>
  )
}
