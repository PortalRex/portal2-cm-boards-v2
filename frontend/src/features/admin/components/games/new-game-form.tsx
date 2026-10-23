import { useState, type FormEvent } from 'react'
import type { CatalogGameRaw } from '@/lib/catalog'
import { createGame, type NewGame } from '../../api/catalog-editor'
import { fromInput, slugify } from '../../utils/catalog-editor'
import {
  actions,
  button,
  card,
  cardTitle,
  error,
  field,
  formLabel,
  formLabelText,
  hint,
  primary,
  row,
} from './styles'
import { useAction } from './use-action'

// In legacy the season's link checkbox sat in the form's labels rule (a column), so the box is
// above its text, both centred.
const formCheck = 'flex min-w-[180px] flex-1 flex-col items-center gap-1 text-sm'

/** A new game, or a season: a copy of a game's chapters and maps for a stretch of time. */
export function NewGameForm({
  kind,
  games,
  onCancel,
  onCreated,
}: {
  kind: 'game' | 'season'
  games: CatalogGameRaw[]
  onCancel: () => void
  onCreated: (id: number) => void
}) {
  const season = kind === 'season'
  const bases = games.filter((g) => g.kind === 'game')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [base, setBase] = useState(String(bases[0]?.id ?? 1))
  const [starts, setStarts] = useState(`${new Date().toISOString().slice(0, 10)}T00:00`)
  const [ends, setEnds] = useState('')
  const [link, setLink] = useState(true)
  const { busy, error: failure, run } = useAction()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const body: NewGame = { name, slug }
    if (season)
      Object.assign(body, {
        base_game_id: Number(base),
        starts_at: fromInput(starts),
        ends_at: fromInput(ends),
        link_to_base: link,
      })
    const out = await run(() => createGame(body))
    if (out) onCreated(out.id)
  }

  return (
    <form
      className={`${card} flex flex-col gap-3`}
      onSubmit={(e) => void submit(e)}
      aria-label={season ? 'New season' : 'New game'}
    >
      <h3 className={cardTitle}>{season ? 'New season' : 'New game'}</h3>
      {season && (
        <p className={hint}>
          A season copies a game's chapters and maps. With the maps linked, new runs set between the start and
          end count on the season's boards as well as the original ones (each board only takes improvements on
          the player's best there). Existing times aren't copied.
        </p>
      )}
      <label className={formLabel}>
        <span className={formLabelText}>Name</span>
        <input
          className={field}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (!slugEdited) setSlug(slugify(e.target.value))
          }}
          maxLength={80}
          required
          autoFocus
        />
      </label>
      <label className={formLabel}>
        <span className={formLabelText}>Link name</span>
        <input
          className={field}
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value)
            setSlugEdited(true)
          }}
          pattern="[a-z0-9][a-z0-9-]{1,31}"
          title="Lowercase letters, digits and dashes"
          required
        />
      </label>
      {season && (
        <>
          <label className={formLabel}>
            <span className={formLabelText}>Map pool from</span>
            <select className={field} value={base} onChange={(e) => setBase(e.target.value)}>
              {bases.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <div className={row}>
            <label className={formLabel}>
              <span className={formLabelText}>Starts (UTC)</span>
              <input
                className={field}
                type="datetime-local"
                value={starts}
                onChange={(e) => setStarts(e.target.value)}
                required
              />
            </label>
            <label className={formLabel}>
              <span className={formLabelText}>Ends (UTC, optional)</span>
              <input
                className={field}
                type="datetime-local"
                value={ends}
                onChange={(e) => setEnds(e.target.value)}
              />
            </label>
          </div>
          <label className={formCheck}>
            <input type="checkbox" checked={link} onChange={(e) => setLink(e.target.checked)} />
            Link the season's maps to {bases.find((g) => String(g.id) === base)?.name || 'the base game'} (new
            runs count on both)
          </label>
        </>
      )}
      {failure && <p className={error}>{failure}</p>}
      <div className={actions}>
        <button type="button" className={button} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className={primary} disabled={busy}>
          {busy ? (season ? 'Copying maps…' : 'Creating…') : 'Create'}
        </button>
      </div>
    </form>
  )
}
