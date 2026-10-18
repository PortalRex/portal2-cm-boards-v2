import { cn } from 'cn'
import { useState } from 'react'
import { defaultModeLabel, type CatalogGameRaw } from '@/lib/catalog'
import { updateGame } from '../../api/catalog-editor'
import { gameModes, modeKey, modeName } from '../../utils/catalog-editor'
import {
  addButton,
  addForm,
  button,
  card,
  cardHead,
  cardTitle,
  danger,
  error,
  field,
  hint,
  inline,
  shortField,
} from './styles'
import type { OnChanged } from './types'
import { useAction } from './use-action'

/**
 * A game's modes (boards), each with what the site calls it. A season's modes come from its base
 * game, so it can rename them but not add any.
 */
export function GameModes({ game, onChanged }: { game: CatalogGameRaw; onChanged: OnChanged }) {
  const season = game.kind === 'season'
  const modes = gameModes(game)
  if (!modes.length && season) return null
  return (
    <div className={card}>
      <div className={cardHead}>
        <h3 className={cardTitle}>Game modes</h3>
      </div>
      <p className={hint}>
        Each mode is its own board, with the chapters put in it. Leave a name empty to use the default.
        {!season && ' A new mode shows on the site once a chapter in it has maps.'}
      </p>
      <div className="flex flex-col gap-2">
        {modes.map((mode) => (
          <ModeName
            key={mode}
            game={game}
            mode={mode}
            chapters={game.chapters.filter((c) => c.game_mode === mode).length}
            onChanged={onChanged}
          />
        ))}
      </div>
      {!season && <AddMode game={game} modes={modes} onChanged={onChanged} />}
    </div>
  )
}

function ModeName({
  game,
  mode,
  chapters,
  onChanged,
}: {
  game: CatalogGameRaw
  mode: string
  chapters: number
  onChanged: OnChanged
}) {
  const saved = game.mode_names?.[mode] || ''
  const [name, setName] = useState(saved)
  const { busy, error: failure, run } = useAction()
  const save = async (value: string) => {
    if ((await run(() => updateGame(game.id, { mode_name: { mode, name: value } }))) !== undefined)
      void onChanged()
  }
  return (
    <form
      className={inline}
      onSubmit={(e) => {
        e.preventDefault()
        void save(name)
      }}
    >
      <span className="flex min-w-[110px] flex-col text-sm leading-[1.2] text-text-2">
        {mode}
        <small className="text-xs text-text-muted">
          {chapters ? `${chapters} chapter${chapters === 1 ? '' : 's'}` : 'no chapters yet'}
        </small>
      </span>
      <input
        className={cn(field, 'w-[240px]')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={defaultModeLabel(mode)}
        maxLength={40}
        aria-label={`Name for ${mode}`}
      />
      <button type="submit" className={button} disabled={busy || name.trim() === saved}>
        Save
      </button>
      {saved && chapters > 0 && (
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => {
            setName('')
            void save('')
          }}
        >
          Reset
        </button>
      )}
      {!chapters && (
        <button type="button" className={danger} disabled={busy} onClick={() => void save('')}>
          Remove
        </button>
      )}
      {failure && <span className={error}>{failure}</span>}
    </form>
  )
}

function AddMode({
  game,
  modes,
  onChanged,
}: {
  game: CatalogGameRaw
  modes: string[]
  onChanged: OnChanged
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [keyEdited, setKeyEdited] = useState(false)
  const { busy, error: failure, run } = useAction()
  if (!open)
    return (
      // `.ge-modes + .ge-add`: 10px under the modes, not the usual 12px.
      <button type="button" className={cn(addButton, 'mt-2.5')} onClick={() => setOpen(true)}>
        + Add mode
      </button>
    )
  const taken = modes.includes(key)
  return (
    <form
      className={addForm}
      aria-label="Add mode"
      onSubmit={async (e) => {
        e.preventDefault()
        if ((await run(() => updateGame(game.id, { mode_name: { mode: key, name } }))) !== undefined) {
          setOpen(false)
          setName('')
          setKey('')
          setKeyEdited(false)
          void onChanged()
        }
      }}
    >
      <input
        className={field}
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          if (!keyEdited) setKey(modeKey(e.target.value))
        }}
        placeholder="Mode name"
        aria-label="Mode name"
        maxLength={40}
        required
        autoFocus
      />
      <input
        className={shortField}
        value={key}
        onChange={(e) => {
          setKey(modeKey(e.target.value))
          setKeyEdited(true)
        }}
        placeholder="key"
        aria-label="Mode key"
        title="Short key for the mode, used in links (lowercase letters, digits, underscores)"
        required
      />
      <button type="submit" className={button} disabled={busy || !key || taken}>
        Add
      </button>
      <button type="button" className={button} onClick={() => setOpen(false)}>
        Cancel
      </button>
      {taken && <span className={error}>This game already has a mode with that key.</span>}
      {failure && <span className={error}>{failure}</span>}
    </form>
  )
}

/** Choosing a chapter's mode: the game's modes, and Singleplayer / Cooperative if it has neither. */
export function ModeSelect({
  game,
  value,
  onChange,
}: {
  game: CatalogGameRaw
  value: string
  onChange: (mode: string) => void
}) {
  const modes = [...new Set([...gameModes(game), 'sp', 'coop', value])]
  return (
    <select
      className={field}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Mode"
      title="The mode (board) this chapter counts for"
    >
      {modes.map((m) => (
        <option key={m} value={m}>
          {modeName(game, m)} ({m})
        </option>
      ))}
    </select>
  )
}
