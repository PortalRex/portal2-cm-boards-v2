import { cn } from 'cn'
import { useState } from 'react'
import { ThumbDownIcon, ThumbUpIcon } from '@/components/icons'
import { useCurrentUser } from '@/hooks/use-current-user'
import { setReaction, type Reaction, type Reactions } from '@/lib/runs/reactions'
import type { Run } from '@/types/runs'

const button =
  'inline-flex h-[34px] cursor-pointer items-center gap-[5px] rounded-[17px] border border-line bg-[rgb(var(--panel-rgb)/0.6)] px-2.5 text-[15px] text-text-muted hover:not-disabled:border-line-strong hover:not-disabled:text-foreground disabled:cursor-default upto1400:h-[30px] upto1400:gap-[3px] upto1400:px-1.5 upto1400:text-sm'

/** Thumbs up / down counts in the row; signed-in players can react (click again to clear). */
export function RowReactions({ entry, myReaction }: { entry: Run; myReaction: Reaction | null | undefined }) {
  const user = useCurrentUser()
  const signedIn = Boolean(user) && !user?.sample
  // The counts after reacting here (legacy kept them in the row too).
  const [state, setState] = useState<Reactions | null>(null)
  const [busy, setBusy] = useState(false)
  const r = state ?? { up: entry.reactionsUp, down: entry.reactionsDown, mine: myReaction ?? null }

  const react = async (value: 'up' | 'down') => {
    if (!signedIn || busy) return
    setBusy(true)
    try {
      const mine = value === 'up' ? 1 : -1
      setState(await setReaction(entry.id, r.mine === mine ? null : value))
    } catch {
      // Leave the counts as they were.
    } finally {
      setBusy(false)
    }
  }
  const hint = signedIn ? undefined : 'Sign in to react'
  const icon = 'size-[22px] upto1400:size-[18px]'
  return (
    <span className="inline-flex gap-1 upto1400:gap-[3px]">
      <button
        type="button"
        className={cn(button, r.mine === 1 && 'border-brand text-brand-light')}
        disabled={!signedIn || busy}
        onClick={() => void react('up')}
        title={hint ?? 'Thumbs up'}
        aria-pressed={r.mine === 1}
        aria-label={`Thumbs up (${r.up})`}
      >
        <ThumbUpIcon className={icon} fill={r.mine === 1 ? 'currentColor' : 'none'} />
        <span className="num">{r.up}</span>
      </button>
      <button
        type="button"
        className={cn(button, r.mine === -1 && 'border-hl-red text-hl-red-text')}
        disabled={!signedIn || busy}
        onClick={() => void react('down')}
        title={hint ?? 'Thumbs down'}
        aria-pressed={r.mine === -1}
        aria-label={`Thumbs down (${r.down})`}
      >
        <ThumbDownIcon className={icon} fill={r.mine === -1 ? 'currentColor' : 'none'} />
        <span className="num">{r.down}</span>
      </button>
    </span>
  )
}
