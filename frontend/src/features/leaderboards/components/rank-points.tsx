import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Bubble } from '@/components/bubble'
import { bubbleAnchor } from '@/lib/bubble'
import { pointsText } from '../utils/rank-points'

/**
 * A board rank that says what it's worth: on hover, or on a tap (phones have no hover), which
 * doesn't open the row. A tapped bubble closes on a tap elsewhere or when the page scrolls.
 */
export function RankPoints({ points, children }: { points: number; children: ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const [pinned, setPinned] = useState(false)
  const show = () => setAt(bubbleAnchor(ref.current, 110))
  useEffect(() => {
    if (!pinned) return
    const close = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return
      setPinned(false)
      setAt(null)
    }
    const scroll = () => {
      setPinned(false)
      setAt(null)
    }
    document.addEventListener('pointerdown', close)
    window.addEventListener('scroll', scroll, true)
    return () => {
      document.removeEventListener('pointerdown', close)
      window.removeEventListener('scroll', scroll, true)
    }
  }, [pinned])
  const text = pointsText(points)
  return (
    <button
      ref={ref}
      type="button"
      aria-label={text}
      onMouseEnter={show}
      onMouseLeave={() => !pinned && setAt(null)}
      onFocus={show}
      onBlur={() => !pinned && setAt(null)}
      onClick={() => {
        setPinned(!pinned)
        if (pinned) setAt(null)
        else show()
      }}
      className="inline-flex cursor-pointer border-0 bg-transparent p-0 text-inherit"
    >
      {children}
      {at && <Bubble at={at}>{text}</Bubble>}
    </button>
  )
}
