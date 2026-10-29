import { cn } from 'cn'
import { viewerFrameSrc, type ReplayRuns } from '@/lib/runs/viewer'

/**
 * The demo viewer replaying runs in the page (its own header left out): full on the replay page,
 * compact (without its side panels) in a run's details. A new set of runs loads it afresh.
 */
export function ReplayFrame({
  runs,
  embed,
  title,
  className,
}: {
  runs: ReplayRuns
  embed: 'full' | 'compact'
  title: string
  className?: string
}) {
  const src = viewerFrameSrc(runs, embed)
  return (
    <iframe
      key={src}
      src={src}
      title={title}
      allow="fullscreen"
      className={cn('block w-full rounded-lg border border-track bg-[#0f1115]', className)}
    />
  )
}
