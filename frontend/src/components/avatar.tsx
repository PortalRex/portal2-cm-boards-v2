import { cn } from 'cn'
import { countryName } from '@/lib/data/countries'

/** A player's picture, or their initial when they have none. */
export function Avatar({
  src,
  name,
  size = 46,
  className,
}: {
  src: string | null | undefined
  name?: string | null
  size?: number
  className?: string
}) {
  const box = { width: size, height: size }
  return src ? (
    <img
      className={cn('shrink-0 bg-track object-cover', className)}
      src={src}
      alt=""
      width={size}
      height={size}
      style={box}
      loading="lazy"
    />
  ) : (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center bg-track font-semibold text-text-muted',
        className,
      )}
      style={box}
      aria-hidden
    >
      {name?.[0]?.toUpperCase()}
    </span>
  )
}

/** A country's flag (from flagcdn, as legacy), named for screen readers and on hover. */
export function Flag({ code, height = 20 }: { code: string | null | undefined; height?: number }) {
  if (!code) return null
  const name = countryName(code)
  return (
    <img
      className="shrink-0 rounded-[2px] object-cover"
      src={`https://flagcdn.com/h40/${code.toLowerCase()}.png`}
      alt={name}
      title={name}
      style={{ height, width: Math.round(height * 1.5) }}
      loading="lazy"
    />
  )
}
