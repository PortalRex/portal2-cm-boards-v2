import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from 'cn'
import { useState } from 'react'
import { EmptyState, Loading } from '@/components/status'
import { getCatalog, type CatalogGameRaw } from '@/lib/catalog'
import { invalidateRun } from '@/lib/invalidate'
import { queryKeys } from '@/lib/query-keys'
import { GamePanel } from './game-panel'
import { NewGameForm } from './new-game-form'
import { button, error } from './styles'
import type { EditorMap } from './types'

/**
 * Admins: games, seasons, chapters, maps, categories and linked leaderboards. Maps are dragged
 * between chapters (and chapters reordered) locally, then saved together with "Save layout".
 * Linked maps share new runs: a run on one also counts on the other when it beats the player's
 * best there. Every change reloads the catalog, so the whole site follows the edits.
 */
export function GamesEditor() {
  const qc = useQueryClient()
  // The catalog as the server sends it, fetched fresh for the editor (the site's copy is kept
  // for the visit).
  const catalog = useQuery({
    queryKey: queryKeys.catalog(),
    queryFn: ({ signal }) => getCatalog(signal),
    refetchOnMount: 'always',
    retry: false,
  })
  const [selected, setSelected] = useState<number | null>(null)
  const [creating, setCreating] = useState<'game' | 'season' | null>(null)

  const reload = async (select?: number | null) => {
    await qc.invalidateQueries({ queryKey: queryKeys.catalog() })
    void invalidateRun(qc, {})
    if (select !== undefined) setSelected(select)
  }

  if (!catalog.data) return catalog.error ? <p className={error}>{catalog.error.message}</p> : <Loading />
  const games: CatalogGameRaw[] = catalog.data
  const game = games.find((g) => g.id === selected)
  const allMaps: EditorMap[] = games.flatMap((g) =>
    g.chapters.flatMap((c) => c.maps.map((m) => ({ ...m, game: g, multiplayer: c.is_multiplayer }))),
  )

  return (
    <div className="grid grid-cols-[240px_minmax(0,1fr)] items-start gap-5 max-[900px]:grid-cols-1">
      <aside className="flex flex-col gap-1" aria-label="Games">
        {games.map((g) => (
          <button
            key={g.id}
            type="button"
            aria-pressed={g.id === selected}
            className={cn(
              'flex cursor-pointer flex-col items-start rounded-[4px] border border-transparent bg-transparent px-3.5 text-left text-[15px] whitespace-nowrap text-foreground',
              g.id === selected && 'border-line bg-seg-active',
            )}
            onClick={() => setSelected(g.id)}
          >
            <span>{g.name}</span>
            <small className="text-[13px] text-text-muted">
              {g.kind === 'season' ? 'Season' : 'Game'}
              {g.hidden ? ' · hidden' : ''}
            </small>
          </button>
        ))}
        <div className="mt-2.5 flex flex-col gap-1.5">
          <button type="button" className={button} onClick={() => setCreating('game')}>
            + New game
          </button>
          <button type="button" className={button} onClick={() => setCreating('season')}>
            + New season
          </button>
        </div>
      </aside>
      <section className="flex min-w-0 flex-col gap-4">
        {creating ? (
          <NewGameForm
            kind={creating}
            games={games}
            onCancel={() => setCreating(null)}
            onCreated={(id) => {
              setCreating(null)
              void reload(id)
            }}
          />
        ) : game ? (
          <GamePanel
            key={game.id}
            game={game}
            games={games}
            allMaps={allMaps}
            onChanged={() => reload()}
            onDeleted={() => reload(null)}
          />
        ) : (
          <EmptyState>Pick a game, or create a game or season.</EmptyState>
        )}
      </section>
    </div>
  )
}
