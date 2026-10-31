import { useEffect, useRef, useState } from 'react'
import coopBots from '@/assets/coop-bots.png'
import { COOP_CHAPTERS } from '@/lib/catalog/builtin-chapters'
import { CHAMBER_IMAGES } from '@/lib/catalog/builtin-images'
import { crtSignal, type Feed } from './crt-signal'

const coopMapName = (id: string) =>
  COOP_CHAPTERS.flatMap((c) => c.maps).find(([map]) => map === id)?.[1] ?? id

// The monitor's channels: the co-op bots, then co-op chambers with something going on (bots, light
// bridges, funnels, lasers), from the site's bundled chamber pictures.
const FEEDS: Feed[] = [
  { src: coopBots, label: 'Atlas / P-body', silhouette: { x: 0.7, split: 0.49 } },
  ...['47849', '47828', '52665', '47741', '49343'].map((id) => ({
    src: CHAMBER_IMAGES[id]!,
    label: coopMapName(id),
  })),
]

/**
 * An old CRT surveillance monitor cycling camera feeds (see crt-signal.ts), under its glass: a fine
 * RGB grille, grain and a vignette with glare (the crt-* utilities in index.css). The signal is
 * on a canvas the size of the screen (at most 1.25 pixels per pixel) that only changes when the
 * channel does or it glitches, in a visible tab; it stays on the first channel for people who ask
 * for less motion, and in a `preview`.
 */
export function Crt({ preview = false }: { preview?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [channel, setChannel] = useState(0)

  useEffect(() => {
    const canvas = ref.current
    // No ResizeObserver: not a real browser (tests); nothing to draw on.
    if (!canvas || typeof ResizeObserver === 'undefined') return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // A preview (the Settings swatch) is a still too.
    const still = preview || (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
    const start = performance.now()
    let timer = 0
    let raf = 0
    // Steps the signal now, then again when it asks (on a screen refresh, so not while the tab is
    // hidden).
    const run = () => {
      window.clearTimeout(timer)
      cancelAnimationFrame(raf)
      const wait = signal.step((performance.now() - start) / 1000)
      if (wait !== Infinity) timer = window.setTimeout(() => (raf = requestAnimationFrame(run)), wait * 1000)
    }
    const signal = crtSignal(ctx, FEEDS, { still, onChannel: setChannel, onLoad: run })

    const fit = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.25)
      const { width, height } = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.round(width * ratio))
      canvas.height = Math.max(1, Math.round(height * ratio))
      signal.resize(canvas.width, canvas.height, ratio)
      run()
    }
    const observer = new ResizeObserver(fit)
    observer.observe(canvas)
    fit()
    return () => {
      window.clearTimeout(timer)
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [preview])

  return (
    <div className="crt-screen absolute inset-0 overflow-hidden">
      <canvas ref={ref} aria-hidden className="absolute inset-0 size-full" />
      <div className="crt-grille absolute inset-0" />
      <div className="crt-grain absolute inset-0" />
      <div className="crt-tube absolute inset-0" />
      {/* The camera's on-screen label, above the page's veil so it stays crisp. */}
      <div
        hidden={preview}
        className="absolute top-5 left-5 z-[1] font-mono text-[11px] leading-[1.5] tracking-[0.08em] text-[#e1f0ff]/90 uppercase [text-shadow:0_0_6px_rgb(120_200_255/0.8)]"
      >
        <span className="crt-rec mr-1.5 inline-block size-[7px] rounded-full bg-[#ff4646] align-[1px]" />
        CAM {String(channel + 1).padStart(2, '0')}
        <br />
        {FEEDS[channel]!.label}
      </div>
    </div>
  )
}
