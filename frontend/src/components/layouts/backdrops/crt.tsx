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

/** Milliseconds the pages' monitor is kept with no page showing it (another background picked). */
const KEEP = 10_000

/** A canvas with the signal on it, moved onto whichever page shows it. */
interface Monitor {
  canvas: HTMLCanvasElement
  /** The channel on screen, and who to tell when it changes (the shown page's label). */
  channel: number
  onChannel: (channel: number) => void
  /** Sizes the canvas to the screen; it's drawn again only if that changed. */
  fit(): void
  play(): void
  pause(): void
}

function createMonitor(still: boolean): Monitor | null {
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  canvas.className = 'absolute inset-0 size-full'
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  // The signal's clock runs from the monitor's start, page to page.
  const start = performance.now()
  let sized = false
  let playing = false
  let timer = 0
  let raf = 0
  // Steps the signal now, then again when it asks (on a screen refresh, so not while the tab is
  // hidden). Not while paused: a picture that loads with no page showing must not start the loop.
  const run = () => {
    if (!playing) return
    window.clearTimeout(timer)
    cancelAnimationFrame(raf)
    const wait = signal.step((performance.now() - start) / 1000)
    if (wait !== Infinity) timer = window.setTimeout(() => (raf = requestAnimationFrame(run)), wait * 1000)
  }
  const monitor: Monitor = {
    canvas,
    channel: 0,
    onChannel: () => {},
    fit() {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.25)
      const { width, height } = canvas.getBoundingClientRect()
      const w = Math.max(1, Math.round(width * ratio))
      const h = Math.max(1, Math.round(height * ratio))
      // Setting the size clears the canvas, even to the same size.
      if (!sized || w !== canvas.width || h !== canvas.height) {
        canvas.width = w
        canvas.height = h
        signal.resize(w, h, ratio)
        sized = true
      }
      run()
    },
    play() {
      playing = true
      run()
    },
    pause() {
      playing = false
      window.clearTimeout(timer)
      cancelAnimationFrame(raf)
    },
  }
  const signal = crtSignal(ctx, FEEDS, {
    still,
    onChannel: (channel) => {
      monitor.channel = channel
      monitor.onChannel(channel)
    },
    onLoad: run,
  })
  return monitor
}

// The pages' monitor: one for the visit, so another page carries on where the last one was (the
// same channel, as far into it) instead of starting over.
let shared: Monitor | null = null
let release = 0

/**
 * An old CRT surveillance monitor cycling camera feeds (see crt-signal.ts), under its glass: a fine
 * RGB grille, grain and a vignette with glare (the crt-* utilities in index.css). The signal is
 * on a canvas the size of the screen (at most 1.25 pixels per pixel) that only changes when the
 * channel does or it glitches, in a visible tab; it stays on the first channel for people who ask
 * for less motion, and in a `preview`. Every page shows the same monitor, moved onto it.
 */
export function Crt({ preview = false }: { preview?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [channel, setChannel] = useState(() => (preview ? 0 : (shared?.channel ?? 0)))

  useEffect(() => {
    const screen = ref.current
    // No ResizeObserver: not a real browser (tests).
    if (!screen || typeof ResizeObserver === 'undefined') return
    // A preview (the Settings swatch) is a still of its own.
    const still = preview || (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
    let monitor: Monitor | null
    if (preview) monitor = createMonitor(true)
    else {
      window.clearTimeout(release)
      monitor = shared ??= createMonitor(still)
    }
    // Nothing to draw on.
    if (!monitor) return
    screen.prepend(monitor.canvas)
    monitor.onChannel = setChannel
    const observer = new ResizeObserver(() => monitor.fit())
    observer.observe(monitor.canvas)
    monitor.play()
    monitor.fit()
    return () => {
      observer.disconnect()
      // The next page may have taken it already.
      if (monitor.canvas.parentNode !== screen) return
      monitor.pause()
      monitor.onChannel = () => {}
      monitor.canvas.remove()
      if (monitor === shared)
        release = window.setTimeout(() => {
          if (shared && !shared.canvas.isConnected) shared = null
        }, KEEP)
    }
  }, [preview])

  return (
    <div ref={ref} className="crt-screen absolute inset-0 overflow-hidden">
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
