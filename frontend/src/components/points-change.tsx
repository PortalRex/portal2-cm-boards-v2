import { cn } from 'cn'
import { TriangleDown, TriangleUp } from './icons'

/** A green arrow up or red arrow down for points gained or lost lately, saying how many. */
export function PointsChange({ change, days }: { change: number | null | undefined; days: number }) {
  if (!change) return null
  const Arrow = change > 0 ? TriangleUp : TriangleDown
  const amount = Number.isInteger(change) ? change : change.toFixed(1)
  const text = `${change > 0 ? '+' : ''}${amount} point${Math.abs(change) === 1 ? '' : 's'} in the last ${days} days`
  return (
    <span
      title={text}
      className={cn('mr-1 inline-flex align-[-1px]', change > 0 ? 'text-green' : 'text-destructive')}
    >
      <Arrow size={10} role="img" aria-label={text} />
    </span>
  )
}
