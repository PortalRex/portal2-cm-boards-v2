import { useQuery } from '@tanstack/react-query'
import { useDebounced } from '@/hooks/use-debounced'
import { userSearchQueryOptions, type UserHit } from '@/lib/users/search'
import { Avatar } from './avatar'

/**
 * The players matching a name or Steam id (searched once typing stops), as a list under a search
 * box to pick one from. Nothing shows for under two characters.
 */
export function PlayerSuggestions({
  q,
  label,
  onPick,
}: {
  q: string
  label: string
  onPick: (player: UserHit) => void
}) {
  const query = useDebounced(q, 250)
  const searching = query.trim().length >= 2
  const results = useQuery({ ...userSearchQueryOptions(query), enabled: searching })
  if (!searching) return null
  return (
    <ul
      aria-label={label}
      className="glass-float absolute inset-x-0 top-[calc(100%+4px)] z-20 m-0 list-none rounded-md border border-line bg-menu p-1"
    >
      {(results.data ?? []).map((p) => (
        <li key={p.profileNumber}>
          <button
            type="button"
            // Kept from taking the focus, so the box's blur doesn't close the list before the click.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(p)}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-[4px] border-0 bg-transparent px-2 py-1.5 text-left text-[15px] text-foreground hover:bg-seg-hover"
          >
            <Avatar src={p.avatar} name={p.name} size={24} />
            <span>{p.name}</span>
            <small className="ml-auto text-text-muted">{p.runs} runs</small>
          </button>
        </li>
      ))}
      {results.data && !results.data.length && (
        <li className="px-2 py-1.5 text-text-muted">No players found.</li>
      )}
    </ul>
  )
}
