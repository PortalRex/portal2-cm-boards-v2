import { useState } from 'react'
import type { CatalogGameRaw } from '@/lib/catalog'
import { linkGames, unlinkGames } from '../../api/catalog-editor'
import { addForm, button, card, cardTitle, chip, error, field, hint, textDanger } from './styles'
import type { EditorMap, OnChanged } from './types'
import { useAction } from './use-action'

/** The games this game's maps are linked to, with bulk link / unlink. */
export function GameLinks({
  game,
  games,
  allMaps,
  onChanged,
}: {
  game: CatalogGameRaw
  games: CatalogGameRaw[]
  allMaps: EditorMap[]
  onChanged: OnChanged
}) {
  const gameOf = new Map(allMaps.map((m) => [m.steam_id, m.game]))
  const counts = new Map<number, number>()
  for (const m of game.chapters.flatMap((c) => c.maps)) {
    for (const l of m.links) {
      const g = gameOf.get(l)
      if (g) counts.set(g.id, (counts.get(g.id) ?? 0) + 1)
    }
  }
  const others = games.filter((g) => g.id !== game.id)
  // Nothing picked until staff choose a game (no game is preselected).
  const [target, setTarget] = useState('')
  const { busy, error: failure, run } = useAction()
  return (
    <div className={card}>
      <h3 className={cardTitle}>Linked leaderboards</h3>
      <p className={hint}>
        A new run on a linked map also counts on the other map when it beats the player's best there. Linking
        doesn't copy existing times.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {[...counts].map(([id, n]) => (
          <span key={id} className={chip}>
            {games.find((g) => g.id === id)?.name}{' '}
            <small className="text-xs text-brand-light">{n} maps</small>
            <button
              type="button"
              className={textDanger}
              disabled={busy}
              onClick={async () => {
                if ((await run(() => unlinkGames(game.id, id))) !== undefined) void onChanged()
              }}
            >
              Unlink all
            </button>
          </span>
        ))}
        {!counts.size && <span className={hint}>Not linked to anything.</span>}
      </div>
      {others.length > 0 && (
        <div className={addForm}>
          <select
            className={field}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            aria-label="Game to link"
          >
            <option value="" disabled>
              Choose a game…
            </option>
            {others.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={button}
            disabled={busy || target === ''}
            onClick={async () => {
              if ((await run(() => linkGames(game.id, Number(target)))) !== undefined) {
                setTarget('')
                void onChanged()
              }
            }}
          >
            Link matching maps
          </button>
          <span className={hint}>Pairs maps that copy the same map or use the same map file.</span>
        </div>
      )}
      {failure && <p className={error}>{failure}</p>}
    </div>
  )
}

/** A season's maps, copied from its base game (edited there). */
export function SeasonPool({ game, base }: { game: CatalogGameRaw; base: CatalogGameRaw | undefined }) {
  const maps = game.chapters.reduce((n, c) => n + c.maps.length, 0)
  return (
    <div className={card}>
      <h3 className={cardTitle}>Map pool</h3>
      <p className={hint}>
        {maps} maps in {game.chapters.length} chapters, copied from {base?.name || 'the base game'}. Edit maps
        on the base game.
      </p>
      <div className="mt-3 flex flex-col gap-2.5">
        {game.chapters.map((c) => (
          <div key={c.id} className="rounded-md border border-dashed border-transparent bg-row px-3 py-2.5">
            <div className="mb-2 flex flex-wrap items-center gap-2.5">
              <strong className="text-base">{c.name}</strong>
              <small className="text-[13px] text-text-muted">{c.game_mode}</small>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {c.maps.map((m) => (
                // Legacy's read-only chip also picked up the draggable chip's colour and cursor.
                <span
                  key={m.steam_id}
                  className="inline-flex h-7 cursor-grab items-center rounded-[14px] border border-line bg-control-raised px-3 text-sm"
                >
                  {m.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
