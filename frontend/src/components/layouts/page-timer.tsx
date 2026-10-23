import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

// How long the page waits with nothing loading before it counts as done (requests a page makes
// once the first ones answer start within this).
const SETTLE_MS = 200

/**
 * "This page was generated in 0.675 seconds", like the old board's footer: from the start of the
 * page (the browser's navigation on the first load, the click for later pages) until the route
 * and every request it made have finished. Later refreshes (polling) don't count.
 */
export function PageTimer() {
  const router = useRouter()
  const qc = useQueryClient()
  const [seconds, setSeconds] = useState<number | null>(null)
  // performance.now() at the page's start; 0 = the browser's navigation start.
  const start = useRef(0)
  const done = useRef(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    // When everything last went quiet.
    let quietSince = performance.now()
    const idle = () => router.state.status === 'idle' && qc.isFetching() === 0
    const settle = () => {
      if (done.current) return
      if (idle()) quietSince = Math.min(quietSince, performance.now())
      else quietSince = Infinity
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (done.current || !idle() || quietSince === Infinity) return
        done.current = true
        setSeconds((quietSince - start.current) / 1000)
      }, SETTLE_MS)
    }
    const offNavigate = router.subscribe('onBeforeNavigate', (e) => {
      if (!e.pathChanged) return
      start.current = performance.now()
      done.current = false
      quietSince = Infinity
      setSeconds(null)
    })
    const offResolved = router.subscribe('onResolved', settle)
    const offQueries = qc.getQueryCache().subscribe(settle)
    settle()
    return () => {
      clearTimeout(timer)
      offNavigate()
      offResolved()
      offQueries()
    }
  }, [router, qc])

  return (
    <p className="relative z-[1] m-0 pb-4 text-center text-xs text-text-muted" aria-live="polite">
      {seconds != null && `This page was generated in ${seconds.toFixed(3)} seconds`}
    </p>
  )
}
