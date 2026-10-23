import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from 'cn'
import { useState, type FormEvent } from 'react'
import { apiUrl } from '@/lib/api-client'
import { builtInBranding, gameKey, type CatalogGameRaw } from '@/lib/catalog'
import {
  deleteGame,
  gameWebhookQueryOptions,
  removeGameImage,
  setGameImage,
  setGameWebhook,
  testGameWebhook,
  updateGame,
  type GameImageKind,
} from '../../api/catalog-editor'
import { fromInput, toInput } from '../../utils/catalog-editor'
import { GameLinks, SeasonPool } from './game-links'
import { GameModes } from './game-modes'
import { ImageRow } from './image-row'
import { LayoutEditor } from './layout-editor'
import {
  actions,
  button,
  card,
  cardHead,
  cardTitle,
  danger,
  error,
  field,
  formLabel,
  formLabelText,
  hint,
  primary,
  row,
} from './styles'
import type { EditorMap, OnChanged } from './types'
import { useAction } from './use-action'

/** A game or season: its names (and a season's dates), branding, modes, links and maps. */
export function GamePanel({
  game,
  games,
  allMaps,
  onChanged,
  onDeleted,
}: {
  game: CatalogGameRaw
  games: CatalogGameRaw[]
  allMaps: EditorMap[]
  onChanged: OnChanged
  onDeleted: () => void
}) {
  const season = game.kind === 'season'
  const base = games.find((g) => g.id === game.base_game_id)
  const [name, setName] = useState(game.name)
  const [slug, setSlug] = useState(game.slug)
  const [shortName, setShortName] = useState(game.short_name || '')
  const [starts, setStarts] = useState(toInput(game.starts_at))
  const [ends, setEnds] = useState(toInput(game.ends_at))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { busy, error: failure, run } = useAction()
  // Portal 2 and Mel keep their link names (the site's addresses use them).
  const builtin = game.id <= 2
  const brand = builtInBranding(gameKey(game)).brand

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const changes: Record<string, unknown> = {}
    if (name !== game.name) changes.name = name
    if (slug !== game.slug) changes.slug = slug
    if (!season && shortName.trim() !== (game.short_name || '')) changes.short_name = shortName.trim() || null
    if (season && starts !== toInput(game.starts_at)) changes.starts_at = fromInput(starts)
    if (season && ends !== toInput(game.ends_at)) changes.ends_at = fromInput(ends)
    if (!Object.keys(changes).length) return
    if ((await run(() => updateGame(game.id, changes))) !== undefined) void onChanged()
  }

  return (
    <>
      <form className={`${card} flex flex-col gap-3`} onSubmit={(e) => void save(e)} aria-label={game.name}>
        <div className={cardHead}>
          <h3 className={cardTitle}>{game.name}</h3>
          <span className="rounded-[4px] bg-seg-active px-2.5 py-0.5 text-[13px] text-text-2">
            {season ? `Season of ${base?.name || '?'}` : 'Game'}
          </span>
        </div>
        <div className={row}>
          <label className={formLabel}>
            <span className={formLabelText}>Name</span>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </label>
          <label className={formLabel}>
            <span className={formLabelText}>Link name</span>
            <input
              className={field}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              disabled={builtin}
            />
          </label>
          {!season && (
            <label className={formLabel}>
              <span className={formLabelText}>Header name</span>
              <input
                className={field}
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                maxLength={16}
                placeholder={brand}
              />
            </label>
          )}
        </div>
        {!season && (
          <p className={hint}>
            The header name is shown beside the logo while this game is picked (empty: {brand}).
          </p>
        )}
        {season && (
          <div className={row}>
            <label className={formLabel}>
              <span className={formLabelText}>Starts (UTC)</span>
              <input
                className={field}
                type="datetime-local"
                value={starts}
                onChange={(e) => setStarts(e.target.value)}
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
        )}
        {season && (
          <p className={hint}>
            The dates decide which new runs count for the season; times already recorded stay.
          </p>
        )}
        {failure && <p className={error}>{failure}</p>}
        <div className={actions}>
          {!builtin && (
            <button
              type="button"
              className={danger}
              disabled={busy}
              onClick={async () => {
                if (!confirmDelete) return setConfirmDelete(true)
                if ((await run(() => deleteGame(game.id))) !== undefined) onDeleted()
              }}
              onBlur={() => setConfirmDelete(false)}
            >
              {confirmDelete ? 'Click again to delete' : `Delete ${season ? 'season' : 'game'}`}
            </button>
          )}
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={async () => {
              if ((await run(() => updateGame(game.id, { hidden: !game.hidden }))) !== undefined)
                void onChanged()
            }}
          >
            {game.hidden ? 'Show on the site' : 'Hide from the site'}
          </button>
          <button type="submit" className={primary} disabled={busy}>
            Save
          </button>
        </div>
      </form>
      {!season && <GameBranding game={game} onChanged={onChanged} />}
      <GameWebhookCard game={game} />
      <GameModes game={game} onChanged={onChanged} />
      <GameLinks game={game} games={games} allMaps={allMaps} onChanged={onChanged} />
      {season ? (
        <SeasonPool game={game} base={base} />
      ) : (
        <LayoutEditor game={game} allMaps={allMaps} onChanged={onChanged} />
      )}
    </>
  )
}

/**
 * Where the game's new world records are announced: its own Discord webhook (seasons have theirs),
 * so Portal 2, Mel and every other game post to their own channels. Admins only.
 */
function GameWebhookCard({ game }: { game: CatalogGameRaw }) {
  const qc = useQueryClient()
  const webhook = useQuery(gameWebhookQueryOptions(game.id))
  const [url, setUrl] = useState('')
  const [tested, setTested] = useState(false)
  const { busy, error: failure, run } = useAction()
  const current = webhook.data?.set ? webhook.data.url : null
  const save = async (next: string | null) => {
    setTested(false)
    const saved = await run(() => setGameWebhook(game.id, next))
    if (saved === undefined) return
    qc.setQueryData(gameWebhookQueryOptions(game.id).queryKey, saved)
    setUrl('')
  }
  return (
    <section className={card} aria-label="WR announcements">
      <div className={cardHead}>
        <h3 className={cardTitle}>WR announcements</h3>
      </div>
      <p className={cn(hint, 'mb-2.5')}>
        {webhook.isPending ? (
          'Loading…'
        ) : current ? (
          <>
            Posting to <code className="break-all">{current}</code>
          </>
        ) : (
          'Not posting anywhere yet.'
        )}
      </p>
      <form
        className={row}
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          if (url.trim()) void save(url.trim())
        }}
      >
        <input
          className={cn(field, 'min-w-[260px] flex-1')}
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://discord.com/api/webhooks/…"
          aria-label="Discord webhook"
          autoComplete="off"
        />
        <div className={actions}>
          <button type="submit" className={primary} disabled={busy || !url.trim()}>
            {current ? 'Replace' : 'Save'}
          </button>
          {current && (
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={async () => {
                setTested(false)
                if ((await run(() => testGameWebhook(game.id))) !== undefined) setTested(true)
              }}
            >
              Send a test
            </button>
          )}
          {current && (
            <button type="button" className={danger} disabled={busy} onClick={() => void save(null)}>
              Stop posting
            </button>
          )}
        </div>
      </form>
      {failure && <p className={cn(error, 'mt-2')}>{failure}</p>}
      {tested && (
        <p role="status" className={cn(hint, 'mt-2')}>
          Test message sent.
        </p>
      )}
      <p className={cn(hint, 'mt-2.5')}>
        New world records on this {game.kind === 'season' ? 'season' : 'game'}&apos;s boards are posted here,
        once they&apos;re verified. Each game has its own webhook (in Discord: channel settings → Integrations
        → Webhooks).
      </p>
    </section>
  )
}

const IMAGES: { kind: GameImageKind; label: string }[] = [
  { kind: 'logo', label: 'Logo' },
  { kind: 'background', label: 'Background' },
]

/**
 * The logo in the header and the background behind the pages while the game is picked: an
 * uploaded one, else the site's built-in one.
 */
function GameBranding({ game, onChanged }: { game: CatalogGameRaw; onChanged: OnChanged }) {
  const builtIn = builtInBranding(gameKey(game))
  return (
    <section className={card} aria-label="Logo & background">
      <div className={cardHead}>
        <h3 className={cardTitle}>Logo &amp; background</h3>
      </div>
      {IMAGES.map(({ kind, label }) => {
        const version = game[`${kind}_version`]
        const own = version ? apiUrl(`/games/${game.id}/images/${kind}`, { v: version }) : null
        return (
          <ImageRow
            key={kind}
            label={label}
            labelClassName="min-w-[90px]"
            src={own ?? builtIn[kind]}
            uploaded={Boolean(version)}
            builtIn={Boolean(builtIn[kind])}
            thumb={kind === 'logo' ? 'logo' : 'image'}
            emptyText="The site's usual one"
            onUpload={(file) => setGameImage(game.id, kind, file)}
            onRemove={() => removeGameImage(game.id, kind)}
            onChanged={() => void onChanged()}
          />
        )
      })}
      <p className={hint}>
        The logo sits beside the header name and in the game list under it. The background replaces the site's
        usual one (map pages and profiles keep their own pictures). PNG, JPEG or WebP, up to 5 MB.
      </p>
    </section>
  )
}
