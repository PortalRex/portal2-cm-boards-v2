// The CRT background's picture: an old surveillance monitor cycling camera feeds, each drawn as a
// screen of glowing scanlines lifted by the picture's brightness (the Rutt-Etra look). The lines
// glow violet to magenta to cyan with the picture, except where it's portal blue or orange; the
// co-op bots' feed draws Atlas blue and P-body orange (the camera's label is crt.tsx's). Each line
// is drawn three times (its colours, then magenta and cyan a little to each side: the tube's
// fringing), with a little noise.
//
// Drawing a whole picture is slow, so it's never done while anyone watches: the next channel is
// drawn offscreen a few rows at a time in the gaps between frames, and changing channel is a glitch
// cut to it. The first picture scans in as it's drawn. Otherwise the screen holds still (anything
// moving behind glass panels makes every one of them blur it again), apart from a glitch now and
// then.

export interface Feed {
  /** The picture: same origin, so its pixels can be read. */
  src: string
  /** Shown on screen as the camera's name. */
  label: string
  /**
   * A dark silhouette on a clear background (the co-op bots) rather than a photo: drawn as tall as
   * the screen, centred at `x` (a fraction of the screen), blue left of `split` (a fraction of the
   * picture), orange right of it.
   */
  silhouette?: { x: number; split: number }
}

export interface Signal {
  resize(width: number, height: number, ratio: number): void
  /**
   * Does what's due at `time` (seconds): draws a bit more of a picture, a glitch frame, or nothing.
   * Returns the seconds until it wants to be called again (Infinity: not until something changes).
   */
  step(time: number): number
}

interface Grid {
  /** Per point: brightness 0 to 1, and its colour (r, g, b). */
  light: Float32Array
  rgb: Float32Array
}

type Rgb = [number, number, number]

/** Pixels between scanlines, and between the points along one. */
const LINE_GAP = 7
const STEP = 5
/** How far full brightness lifts a line, in line gaps. */
const LIFT = 2.8
/** Seconds a channel holds; a channel change's glitch; frames while it moves. */
const HOLD = 10
const CHANGE = 0.5
const MOVING = 1 / 20
/** Milliseconds of drawing per go, between frames. */
const BUDGET = 4

const BLUE: Rgb = [40, 150, 255]
const ORANGE: Rgb = [255, 140, 30]
// The duotone for everything else, dark to bright.
const RAMP: Rgb[] = [
  [90, 40, 220],
  [170, 50, 255],
  [255, 50, 190],
  [90, 220, 255],
  [225, 240, 255],
]

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function ramp(light: number): Rgb {
  const at = Math.min(0.999, light) * (RAMP.length - 1)
  const i = Math.floor(at)
  const t = at - i
  const a = RAMP[i]!
  const b = RAMP[i + 1]!
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** Portal blue or orange when a pixel is clearly one of them, else null. */
function portalColour(r: number, g: number, b: number): Rgb | null {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max < 110 || (max - min) / max < 0.45) return null
  if (b === max && b > r * 1.4) return BLUE
  if (r === max && g > b * 1.3 && r > b * 1.8) return ORANGE
  return null
}

/** Reads a picture onto a grid of `cols` × `rows` points (null until it has loaded). */
function sample(feed: Feed, image: HTMLImageElement, cols: number, rows: number): Grid | null {
  const sampler = document.createElement('canvas')
  const sctx = sampler.getContext('2d', { willReadFrequently: true })
  if (!sctx || !image.complete || !image.naturalWidth) return null
  sampler.width = cols
  sampler.height = rows
  const iw = image.naturalWidth
  const ih = image.naturalHeight
  // Points are LINE_GAP / STEP times taller than wide, so the picture is squeezed to match.
  const aspect = LINE_GAP / STEP
  const silhouetteWidth = ((rows * 0.92 * iw) / ih) * aspect
  if (feed.silhouette) {
    sctx.drawImage(
      image,
      feed.silhouette.x * cols - silhouetteWidth / 2,
      rows * 0.08,
      silhouetteWidth,
      rows * 0.92,
    )
  } else {
    // Most of a chamber shot's width (they're wide strips), stretched to the screen's height.
    const w = cols / 0.8
    sctx.drawImage(image, (cols - w) / 2, 0, w, rows)
  }
  const data = sctx.getImageData(0, 0, cols, rows).data
  const count = rows * cols
  const luma = new Float32Array(count)
  for (let p = 0; p < count; p++) {
    luma[p] = (0.3 * data[p * 4]! + 0.59 * data[p * 4 + 1]! + 0.11 * data[p * 4 + 2]!) / 255
  }
  // Shots are dark and flat: stretch their brightness between its 4th and 97th percentiles.
  const sorted = feed.silhouette ? null : Float32Array.from(luma).sort()
  const low = sorted ? sorted[Math.floor(count * 0.04)]! : 0
  const high = sorted ? Math.max(low + 0.05, sorted[Math.floor(count * 0.97)]!) : 1
  // Where Atlas (blue) ends and P-body (orange) starts, in points.
  const splitAt = feed.silhouette
    ? feed.silhouette.x * cols - silhouetteWidth * (0.5 - feed.silhouette.split)
    : 0
  const grid: Grid = { light: new Float32Array(count), rgb: new Float32Array(count * 3) }
  for (let p = 0; p < count; p++) {
    let light: number
    let colour: Rgb
    if (feed.silhouette) {
      light = smoothstep(0.15, 0.9, (data[p * 4 + 3]! / 255) * (1 - luma[p]!))
      colour = light > 0.05 ? (p % cols < splitAt ? BLUE : ORANGE) : RAMP[0]!
    } else {
      const level = Math.min(1, Math.max(0, (luma[p]! - low) / (high - low)))
      // Outlines read better as lines: add how much a point stands out from the ones beside it.
      const x = p % cols
      const around =
        ((luma[p - 1] ?? luma[p]!) +
          (luma[p + 1] ?? luma[p]!) +
          (luma[p - cols] ?? luma[p]!) +
          (luma[p + cols] ?? luma[p]!)) /
        4
      const edge = x > 0 && x < cols - 1 ? Math.abs(luma[p]! - around) / (high - low) : 0
      light = Math.min(1, Math.pow(level, 0.85) + edge * 1.4)
      colour = portalColour(data[p * 4]!, data[p * 4 + 1]!, data[p * 4 + 2]!) ?? ramp(light)
    }
    grid.light[p] = light
    grid.rgb.set(colour, p * 3)
  }
  return grid
}

/** A picture being drawn onto its own canvas, a few rows at a time. */
interface Painting {
  feed: number
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D | null
  row: number
}

/**
 * The monitor on `ctx`, cycling `feeds`: `onChannel` hears when it changes, `onLoad` when a picture
 * has loaded (so steps can go on). A `still` one draws the first feed whole and stays on it
 * (reduced motion, previews).
 */
export function crtSignal(
  ctx: CanvasRenderingContext2D,
  feeds: Feed[],
  {
    still = false,
    onChannel,
    onLoad,
  }: { still?: boolean; onChannel?: (channel: number) => void; onLoad?: () => void } = {},
): Signal {
  let width = 1
  let height = 1
  let ratio = 1
  let rows = 0
  let cols = 0
  const images = feeds.map((feed) => {
    const image = new Image()
    image.src = feed.src
    return image
  })
  let grids: (Grid | null)[] = feeds.map(() => null)
  images.forEach((image, i) =>
    image.addEventListener('load', () => {
      if (!rows) return
      grids[i] = sample(feeds[i]!, image, cols, rows)
      onLoad?.()
    }),
  )
  const painting = (feed: number): Painting => {
    const canvas = document.createElement('canvas')
    // Kept in memory rather than on the GPU, so a row can be made to draw at once (see paint).
    return { feed, canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }), row: 0 }
  }
  /** The picture on screen (once drawn), and the next channel's, being drawn. */
  let shown = painting(0)
  let next = painting(1 % feeds.length)
  let shownSince = 0
  let changeAt: number | null = null
  let swapped = false
  let glitchUntil = 0
  let nextGlitch = 6

  const done = (p: Painting) => p.row >= rows

  function restart(p: Painting, feed: number) {
    p.feed = feed
    p.row = 0
    p.canvas.width = width
    p.canvas.height = height
  }

  /** Draws rows of a picture until the time budget is spent (no limit for a still screen). */
  function paint(p: Painting) {
    const grid = grids[p.feed]
    const pctx = p.ctx
    if (!grid || !pctx) return
    if (p.row === 0) {
      const background = pctx.createLinearGradient(0, 0, 0, height)
      background.addColorStop(0, '#04020d')
      background.addColorStop(1, '#0b0420')
      pctx.globalCompositeOperation = 'source-over'
      pctx.fillStyle = background
      pctx.fillRect(0, 0, width, height)
    }
    pctx.globalCompositeOperation = 'lighter'
    pctx.lineWidth = 1.15 * ratio
    pctx.lineJoin = 'round'
    const gap = LINE_GAP * ratio
    const step = STEP * ratio
    const until = performance.now() + BUDGET
    while (p.row < rows && (still || performance.now() < until)) {
      const row = p.row++
      const y0 = (row - 3) * gap
      const path = new Path2D()
      const line = pctx.createLinearGradient(0, 0, (cols - 1) * step, 0)
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col
        const light = grid.light[i]!
        const x = col * step
        const wave = Math.sin((x * 0.003) / ratio + row * 0.1) * 1.4 * ratio
        const noise = (Math.random() - 0.5) * (0.4 + light * 2.2) * ratio
        const y = y0 - light * LIFT * gap + wave + noise
        if (col) path.lineTo(x, y)
        else path.moveTo(x, y)
        if (col % 8 === 0 || col === cols - 1) {
          const c = i * 3
          line.addColorStop(
            col / (cols - 1),
            `rgb(${grid.rgb[c]! | 0} ${grid.rgb[c + 1]! | 0} ${grid.rgb[c + 2]! | 0} / ${0.16 + light * 0.84})`,
          )
        }
      }
      pctx.strokeStyle = line
      pctx.stroke(path)
      pctx.translate(1.6 * ratio, 0)
      pctx.strokeStyle = 'rgb(255 0 120 / 0.2)'
      pctx.stroke(path)
      pctx.translate(-3.2 * ratio, 0)
      pctx.strokeStyle = 'rgb(0 210 255 / 0.18)'
      pctx.stroke(path)
      pctx.translate(1.6 * ratio, 0)
      // The browser keeps drawing commands until the picture is used, which would put the whole
      // picture's work into the frame that first shows it; reading a pixel draws this row now.
      pctx.getImageData(0, 0, 1, 1)
    }
  }

  /** Puts the shown picture on screen, with `slices` of it shifted sideways under flashes of colour. */
  function show(slices = 0, reach = 0) {
    ctx.globalCompositeOperation = 'source-over'
    ctx.drawImage(shown.canvas, 0, 0)
    for (let k = 0; k < slices; k++) {
      const y = Math.random() * height
      const h = (4 + Math.random() * 36) * ratio
      const shift = (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * reach) * ratio
      ctx.globalCompositeOperation = 'source-over'
      ctx.drawImage(shown.canvas, 0, y, width, h, shift, y, width, h)
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = Math.random() < 0.5 ? 'rgb(255 0 170 / 0.14)' : 'rgb(0 200 255 / 0.14)'
      ctx.fillRect(0, y, width, h)
    }
  }

  return {
    resize(w, h, r) {
      width = w
      height = h
      ratio = r
      rows = Math.ceil(h / (LINE_GAP * r)) + 6
      cols = Math.ceil(w / (STEP * r)) + 1
      grids = feeds.map((feed, i) => sample(feed, images[i]!, cols, rows))
      // Everything is drawn again at the new size, starting with the channel on screen.
      restart(shown, shown.feed)
      restart(next, (shown.feed + 1) % feeds.length)
      changeAt = null
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = '#04020d'
      ctx.fillRect(0, 0, w, h)
    },

    step(time) {
      if (!rows) return Infinity
      // Scanning in the picture on screen (first, or after a resize).
      if (!done(shown)) {
        if (!grids[shown.feed]) return Infinity
        paint(shown)
        show()
        if (!done(shown)) return 0
        shownSince = time
        if (still) return Infinity
      }
      // Changing channel: glitch, cut to the next picture halfway through, glitch out.
      if (changeAt !== null) {
        const t = time - changeAt
        if (!swapped && t >= CHANGE / 2) {
          ;[shown, next] = [next, shown]
          swapped = true
          onChannel?.(shown.feed)
        }
        if (t < CHANGE) {
          show(8, 160)
          return MOVING
        }
        show()
        changeAt = null
        shownSince = time
        restart(next, (shown.feed + 1) % feeds.length)
        return 0
      }
      // A glitch now and then (and one clean frame after it).
      if (time >= nextGlitch) {
        glitchUntil = time + 0.1 + Math.random() * 0.2
        nextGlitch = time + 4 + Math.random() * 7
      }
      if (time < glitchUntil) {
        show(4, 70)
        return MOVING
      }
      if (time - glitchUntil < MOVING * 2) show()
      // Meanwhile the next channel is drawn; it's cut to once this one has had its time.
      if (!done(next)) {
        if (!grids[next.feed]) return Infinity
        paint(next)
        return 0
      }
      if (time - shownSince >= HOLD) {
        changeAt = time
        swapped = false
        return 0
      }
      return Math.max(MOVING, Math.min(nextGlitch, shownSince + HOLD) - time)
    },
  }
}
