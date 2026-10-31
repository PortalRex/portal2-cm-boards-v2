import { cn } from 'cn'
import { useEffect, useRef, useState } from 'react'
import { CommentIcon, DownloadIcon, PlayIcon, VideocamIcon, YouTubeIcon } from '@/components/icons'
import { YouTubeEmbed } from '@/components/youtube-embed'
import { Bubble } from '@/components/bubble'
import { bubbleAnchor } from '@/lib/bubble'
import { useRunVideo } from '@/hooks/use-run-video'
import type { VideoRun } from '@/lib/runs/video'
import { apiUrl } from '@/lib/api-client'

const off = 'opacity-[0.18]'
// Drawn a little under the requested slot size, filled rather than outlined.
const shrink = 4
const filled = 'fill-current'
const iconLink = 'inline-flex [&_svg]:block'

const youtubeUrl = (id: string) => `https://www.youtube.com/watch?v=${id.split('?')[0]}`

/** ▶ opens the autorender video, or (with a demo, for admins) offers to request a render. */
export function AutorenderLink({
  run,
  game = 'portal2',
  rendered,
  size = 22,
}: {
  run: VideoRun
  game?: string
  rendered?: Map<number, string>
  size?: number
}) {
  const video = useRunVideo(run, game, rendered)
  // The play triangle reads larger than the other icons, so it gets a little less.
  const px = size - shrink - 2
  const icon = { width: px, height: px }
  if (video.ready) {
    return (
      <a href={video.page} target="_blank" rel="noreferrer" className={iconLink} title="Watch autorender">
        <PlayIcon className={filled} style={icon} aria-hidden />
        <span className="sr-only">Watch autorender</span>
      </a>
    )
  }
  if (!video.render)
    return <PlayIcon className={cn(filled, off)} style={icon} role="img" aria-label="No autorender" />
  return (
    <a
      href={video.render}
      target="_blank"
      rel="noreferrer"
      className={cn(iconLink, 'opacity-55 hover:opacity-100')}
      title="Request an autorender"
    >
      <VideocamIcon className={filled} style={icon} aria-hidden />
      <span className="sr-only">Request an autorender</span>
    </a>
  )
}

export function YouTubeLink({ id, size = 22 }: { id: string | null | undefined; size?: number }) {
  if (!id) return <YouTubeIcon size={size - shrink} className={off} role="img" aria-label="No video" />
  return (
    <a href={youtubeUrl(id)} target="_blank" rel="noreferrer" className={iconLink} title="Watch on YouTube">
      <YouTubeIcon size={size - shrink} />
      <span className="sr-only">Watch on YouTube</span>
    </a>
  )
}

/** Downloads the run's demo straight away (without opening the row). Greyed out without one. */
export function DemoLink({
  demoId,
  size = 22,
  hideMissing = false,
}: {
  demoId: number | null | undefined
  size?: number
  hideMissing?: boolean
}) {
  const icon = { width: size - shrink, height: size - shrink }
  if (!demoId) {
    return hideMissing ? null : <DownloadIcon className={off} style={icon} role="img" aria-label="No demo" />
  }
  return (
    <a
      href={apiUrl(`/demos/${demoId}/file`)}
      download
      className={iconLink}
      title="Download demo"
      onClick={(e) => e.stopPropagation()}
    >
      <DownloadIcon style={icon} aria-hidden />
      <span className="sr-only">Download demo</span>
    </a>
  )
}

/**
 * A run's comment icon: clicking it (which doesn't open the row) shows the comment in a small
 * bubble above it; clicking again or anywhere else closes it. Greyed out without a comment.
 */
export function CommentButton({ note, size = 22 }: { note: string | null | undefined; size?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [pinned, setPinned] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const open = Boolean(note) && pinned
  // A pinned bubble closes on a click elsewhere or when the page scrolls (it's fixed in place).
  useEffect(() => {
    if (!pinned) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setPinned(false)
    }
    const scroll = () => setPinned(false)
    document.addEventListener('pointerdown', close)
    window.addEventListener('scroll', scroll, true)
    return () => {
      document.removeEventListener('pointerdown', close)
      window.removeEventListener('scroll', scroll, true)
    }
  }, [pinned])
  const icon = { width: size - shrink, height: size - shrink }
  if (!note)
    return <CommentIcon className={cn(filled, off)} style={icon} role="img" aria-label="No comment" />
  const place = () => setPos(bubbleAnchor(ref.current))
  return (
    <span className="inline-flex" ref={ref}>
      <button
        type="button"
        className="inline-flex cursor-pointer border-0 bg-transparent p-0 text-inherit"
        aria-label="Show comment"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          place()
          setPinned((p) => !p)
        }}
      >
        <CommentIcon className={filled} style={icon} />
      </button>
      {open && pos && <Bubble at={pos}>{note}</Bubble>}
    </span>
  )
}

/** The video area: autorender first, then YouTube, then a prompt to request a render. */
export function RunVideo({
  run,
  game = 'portal2',
  rendered,
  title,
}: {
  run: VideoRun & { youtubeId?: string | null }
  game?: string
  rendered?: Map<number, string>
  title?: string
}) {
  const video = useRunVideo(run, game, rendered)
  const src = video.ready ? video.src : null
  // Reset when the video changes (keyed state, so no effect is needed).
  const [failedFor, setFailedFor] = useState<string | null>(null)
  const failed = src != null && failedFor === src

  if (video.ready && !failed) {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
        {/* The browser tries each source in turn; only the last one failing means no video. */}
        <video key={video.src} controls preload="metadata" title={title} className="block size-full">
          {video.sources.map((s, i) => (
            <source
              key={s}
              src={s}
              type="video/mp4"
              onError={i === video.sources.length - 1 ? () => setFailedFor(video.src) : undefined}
            />
          ))}
        </video>
        <a
          className="absolute top-2 left-2 rounded-[3px] bg-black/60 px-2 py-0.5 text-xs tracking-[0.06em] text-text-2 uppercase hover:text-foreground"
          href={video.page}
          target="_blank"
          rel="noreferrer"
        >
          Autorender
        </a>
      </div>
    )
  }
  if (run.youtubeId) return <YouTubeEmbed id={run.youtubeId} title={title} />
  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-track bg-row-sub-alt text-text-dim">
      <span>{video.ready ? 'The video couldn’t be played here.' : 'No video'}</span>
      {video.ready ? (
        <a
          className="text-base text-brand-light hover:underline"
          href={video.page}
          target="_blank"
          rel="noreferrer"
        >
          Watch on autorender
        </a>
      ) : (
        video.render && (
          <a
            className="text-base text-brand-light hover:underline"
            href={video.render}
            target="_blank"
            rel="noreferrer"
          >
            Request an autorender
          </a>
        )
      )}
    </div>
  )
}
