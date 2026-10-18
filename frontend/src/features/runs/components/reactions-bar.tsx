import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from 'cn'
import { ThumbDownIcon, ThumbUpIcon } from '@/components/icons'
import { useCurrentUser } from '@/hooks/use-current-user'
import { reactionsQueryOptions, setReaction, type Reactions } from '@/lib/runs/reactions'

const button =
  'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[18px] border border-line bg-control px-3.5 text-base text-text-2 hover:not-disabled:border-line-strong hover:not-disabled:text-foreground disabled:cursor-default'

/** Thumbs up / down. Anyone sees the counts; signed-in players react (click again to clear). */
export function ReactionsBar({ changelogId }: { changelogId: number }) {
  const qc = useQueryClient()
  const user = useCurrentUser()
  const signedIn = Boolean(user) && !user?.sample
  // Like legacy: without the counts the bar isn't shown.
  const counts = useQuery({ ...reactionsQueryOptions(changelogId), retry: false })
  const react = useMutation({
    mutationFn: (value: 'up' | 'down') => {
      const mine = value === 'up' ? 1 : -1
      return setReaction(changelogId, counts.data?.mine === mine ? null : value)
    },
    onSuccess: (next) => qc.setQueryData<Reactions>(reactionsQueryOptions(changelogId).queryKey, next),
  })
  const r = counts.data
  if (!r) return null
  const hint = signedIn ? undefined : 'Sign in to react'
  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={cn(button, r.mine === 1 && 'border-brand text-brand-light')}
        onClick={() => react.mutate('up')}
        disabled={!signedIn}
        title={hint ?? 'Thumbs up'}
        aria-pressed={r.mine === 1}
        aria-label={`Thumbs up (${r.up})`}
      >
        <ThumbUpIcon className="size-6" fill={r.mine === 1 ? 'currentColor' : 'none'} />
        <span className="num">{r.up}</span>
      </button>
      <button
        type="button"
        className={cn(button, r.mine === -1 && 'border-hl-red text-hl-red-text')}
        onClick={() => react.mutate('down')}
        disabled={!signedIn}
        title={hint ?? 'Thumbs down'}
        aria-pressed={r.mine === -1}
        aria-label={`Thumbs down (${r.down})`}
      >
        <ThumbDownIcon className="size-6" fill={r.mine === -1 ? 'currentColor' : 'none'} />
        <span className="num">{r.down}</span>
      </button>
      {react.error && <span className="basis-full text-sm text-hl-red-text">{react.error.message}</span>}
    </div>
  )
}
