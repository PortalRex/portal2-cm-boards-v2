import { useQuery } from '@tanstack/react-query'
import { fetchShareIds } from '@/lib/autorender'

interface MaybeRendered {
  id?: number
  changelogId?: number | null
  autorenderId?: string | null
}

const EMPTY = new Map<number, string>()

/**
 * Runs carry the share id of their autorender video (autorenderId, imported from autorender). For
 * Portal 2 runs without one, this asks autorender whether a video has been rendered since:
 * changelog id -> share id. Empty while it loads or when autorender can't be reached.
 */
export function useRenderedSet(
  runs: MaybeRendered[] | null | undefined,
  game = 'portal2',
): Map<number, string> {
  const ids =
    game === 'portal2'
      ? (runs ?? [])
          .filter((r) => !r.autorenderId)
          .map((r) => r.changelogId ?? r.id)
          .filter((id): id is number => id != null)
      : []
  const { data } = useQuery({
    queryKey: ['autorender', 'share-ids', game, ids],
    queryFn: () => fetchShareIds(ids, game),
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  })
  return data ?? EMPTY
}
