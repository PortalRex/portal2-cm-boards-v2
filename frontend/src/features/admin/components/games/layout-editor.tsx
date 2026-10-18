import { cn } from 'cn'
import { useMemo, useState } from 'react'
import type { CatalogChapterRaw, CatalogGameRaw } from '@/lib/catalog'
import { createChapter, createMap, deleteChapter, saveLayout, updateChapter } from '../../api/catalog-editor'
import { gameModes, modeName, moveChapter, moveMap, type Layout } from '../../utils/catalog-editor'
import { ModeSelect } from './game-modes'
import { MapEditor } from './map-editor'
import {
  actions,
  addButton,
  addForm,
  button,
  card,
  cardHead,
  cardTitle,
  check,
  error,
  field,
  hint,
  inline,
  mapChip,
  primary,
  shortField,
  textButton,
  textDanger,
} from './styles'
import type { EditorMap, OnChanged } from './types'
import { useAction } from './use-action'

const layoutOf = (game: CatalogGameRaw): Layout =>
  game.chapters.map((c) => ({ id: c.id, maps: c.maps.map((m) => m.steam_id) }))

/**
 * Chapters with draggable maps. Names are saved straight away; moving maps and reordering
 * chapters is kept here until "Save layout".
 */
export function LayoutEditor({
  game,
  allMaps,
  onChanged,
}: {
  game: CatalogGameRaw
  allMaps: EditorMap[]
  onChanged: OnChanged
}) {
  const initial = useMemo(() => layoutOf(game), [game])
  // The working layout, started over whenever the saved one changes (after any edit reloads).
  const [work, setWork] = useState({ from: initial, layout: initial })
  if (work.from !== initial) setWork({ from: initial, layout: initial })
  const layout = work.from === initial ? work.layout : initial
  const setLayout = (next: (l: Layout) => Layout) => setWork((w) => ({ ...w, layout: next(w.layout) }))
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const [openMap, setOpenMap] = useState<string | null>(null)
  const { busy, error: failure, run } = useAction()
  const dirty = JSON.stringify(layout) !== JSON.stringify(initial)
  const chapterById = new Map(game.chapters.map((c) => [c.id, c]))
  const mapById = new Map(game.chapters.flatMap((c) => c.maps.map((m) => [m.steam_id, m])))
  const multiplayer = (id: number) => chapterById.get(id)?.is_multiplayer
  const dropOn = (chapter: number, before: string | null) => {
    if (drag && drag !== before) setLayout((l) => moveMap(l, multiplayer, drag, chapter, before))
    setDrag(null)
    setOver(null)
  }

  return (
    <div className={card}>
      <div className={cardHead}>
        <h3 className={cardTitle}>Chapters and maps</h3>
        <div className={actions}>
          {dirty && (
            <button type="button" className={button} onClick={() => setLayout(() => initial)} disabled={busy}>
              Undo changes
            </button>
          )}
          <button
            type="button"
            className={primary}
            disabled={!dirty || busy}
            onClick={async () => {
              if ((await run(() => saveLayout(game.id, layout))) !== undefined) void onChanged()
            }}
          >
            {busy ? 'Saving…' : 'Save layout'}
          </button>
        </div>
      </div>
      <p className={hint}>
        Drag maps between chapters (singleplayer and co-op maps stay in their kind of chapter), use the arrows
        to reorder chapters, then save.
      </p>
      {failure && <p className={error}>{failure}</p>}
      <div className="mt-3 flex flex-col gap-2.5">
        {layout.map((entry, i) => {
          const chapter = chapterById.get(entry.id)
          if (!chapter) return null
          const editing = openMap && entry.maps.includes(openMap) ? mapById.get(openMap) : undefined
          return (
            <div
              key={entry.id}
              role="group"
              aria-label={chapter.name ?? `Chapter ${i + 1}`}
              className={cn(
                'rounded-md border border-dashed border-transparent bg-row px-3 py-2.5',
                over === entry.id && 'border-brand-light bg-seg-hover',
              )}
              onDragOver={(e) => {
                if (!drag) return
                e.preventDefault()
                setOver(entry.id)
              }}
              onDragLeave={() => setOver((o) => (o === entry.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault()
                dropOn(entry.id, null)
              }}
            >
              <ChapterHead
                chapter={chapter}
                game={game}
                index={i}
                count={layout.length}
                onMove={(index, delta) => setLayout((l) => moveChapter(l, index, delta))}
                onChanged={onChanged}
                empty={!entry.maps.length && !chapter.maps.length}
              />
              <div className="flex flex-wrap gap-1.5">
                {entry.maps.map((id) => (
                  <button
                    key={id}
                    type="button"
                    draggable
                    aria-expanded={openMap === id}
                    className={cn(
                      mapChip,
                      drag === id && 'opacity-40',
                      openMap === id && 'border-brand-light',
                    )}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move'
                      setDrag(id)
                    }}
                    onDragEnd={() => {
                      setDrag(null)
                      setOver(null)
                    }}
                    onDragOver={(e) => drag && e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      dropOn(entry.id, id)
                    }}
                    onClick={() => setOpenMap(openMap === id ? null : id)}
                    title="Drag to move; click to edit"
                  >
                    {mapById.get(id)?.name || id}
                  </button>
                ))}
                <AddMap chapter={chapter} onChanged={onChanged} />
              </div>
              {editing && (
                <MapEditor
                  key={editing.steam_id}
                  map={editing}
                  multiplayer={chapter.is_multiplayer}
                  game={game}
                  allMaps={allMaps}
                  onChanged={onChanged}
                  onDeleted={() => setOpenMap(null)}
                />
              )}
            </div>
          )
        })}
      </div>
      <AddChapter game={game} onChanged={onChanged} />
    </div>
  )
}

function ChapterHead({
  chapter,
  game,
  index,
  count,
  onMove,
  onChanged,
  empty,
}: {
  chapter: CatalogChapterRaw
  game: CatalogGameRaw
  index: number
  count: number
  onMove: (index: number, delta: number) => void
  onChanged: OnChanged
  empty: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(chapter.name || '')
  const [mode, setMode] = useState(chapter.game_mode)
  const { busy, error: failure, run } = useAction()
  const arrow = cn(button, 'h-[22px] px-1.5 text-[10px]')
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2.5">
      <span className="inline-flex gap-0.5">
        <button
          type="button"
          className={arrow}
          onClick={() => onMove(index, -1)}
          disabled={index === 0}
          aria-label="Move chapter up"
        >
          ▲
        </button>
        <button
          type="button"
          className={arrow}
          onClick={() => onMove(index, 1)}
          disabled={index === count - 1}
          aria-label="Move chapter down"
        >
          ▼
        </button>
      </span>
      {editing ? (
        <form
          className={inline}
          onSubmit={async (e) => {
            e.preventDefault()
            const changes: { name: string; game_mode?: string } = { name }
            if (mode !== chapter.game_mode) changes.game_mode = mode
            if ((await run(() => updateChapter(chapter.id, changes))) !== undefined) {
              setEditing(false)
              void onChanged()
            }
          }}
        >
          <input
            className={field}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            aria-label="Chapter name"
            autoFocus
          />
          <ModeSelect game={game} value={mode} onChange={setMode} />
          <button type="submit" className={button} disabled={busy}>
            Save
          </button>
          <button
            type="button"
            className={button}
            onClick={() => {
              setEditing(false)
              setMode(chapter.game_mode)
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <>
          <strong className="text-base">{chapter.name}</strong>
          <small
            className="text-[13px] text-text-muted"
            title={`Mode "${chapter.game_mode}": rename it under Game modes`}
          >
            {modeName(game, chapter.game_mode)}
            {chapter.is_multiplayer ? ' · co-op' : ''}
          </small>
          <button type="button" className={textButton} onClick={() => setEditing(true)}>
            Edit
          </button>
          {empty && (
            <button
              type="button"
              className={textDanger}
              onClick={async () => {
                if ((await run(() => deleteChapter(chapter.id))) !== undefined) void onChanged()
              }}
            >
              Delete
            </button>
          )}
        </>
      )}
      {failure && <span className={error}>{failure}</span>}
    </div>
  )
}

function AddChapter({ game, onChanged }: { game: CatalogGameRaw; onChanged: OnChanged }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [multi, setMulti] = useState(false)
  const [mode, setMode] = useState(() => gameModes(game)[0] || 'sp')
  const { busy, error: failure, run } = useAction()
  if (!open)
    return (
      <button type="button" className={addButton} onClick={() => setOpen(true)}>
        + Add chapter
      </button>
    )
  return (
    <form
      className={addForm}
      aria-label="Add chapter"
      onSubmit={async (e) => {
        e.preventDefault()
        if (
          (await run(() => createChapter(game.id, { name, game_mode: mode, is_multiplayer: multi }))) !==
          undefined
        ) {
          setOpen(false)
          setName('')
          void onChanged()
        }
      }}
    >
      <input
        className={field}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Chapter name"
        aria-label="Chapter name"
        maxLength={50}
        required
        autoFocus
      />
      <label className={check}>
        <input
          type="checkbox"
          checked={multi}
          onChange={(e) => {
            setMulti(e.target.checked)
            if (mode === 'sp' || mode === 'coop') setMode(e.target.checked ? 'coop' : 'sp')
          }}
        />
        Co-op
      </label>
      <ModeSelect game={game} value={mode} onChange={setMode} />
      <button type="submit" className={button} disabled={busy}>
        Add
      </button>
      <button type="button" className={button} onClick={() => setOpen(false)}>
        Cancel
      </button>
      {failure && <span className={error}>{failure}</span>}
    </form>
  )
}

function AddMap({ chapter, onChanged }: { chapter: CatalogChapterRaw; onChanged: OnChanged }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [steamId, setSteamId] = useState('')
  const [bsp, setBsp] = useState('')
  const { busy, error: failure, run } = useAction()
  if (!open)
    return (
      <button
        type="button"
        className={cn(mapChip, 'cursor-pointer border-dashed bg-transparent text-text-muted')}
        onClick={() => setOpen(true)}
      >
        + Map
      </button>
    )
  return (
    <form
      className={addForm}
      aria-label="Add map"
      onSubmit={async (e) => {
        e.preventDefault()
        const created = await run(() =>
          createMap(chapter.id, { name, steam_id: steamId || null, bsp_name: bsp || null }),
        )
        if (created !== undefined) {
          setOpen(false)
          setName('')
          setSteamId('')
          setBsp('')
          void onChanged()
        }
      }}
    >
      <input
        className={field}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Map name"
        aria-label="Map name"
        maxLength={50}
        required
        autoFocus
      />
      <input
        className={field}
        value={bsp}
        onChange={(e) => setBsp(e.target.value)}
        placeholder="Map file (sp_a1_intro1)"
        aria-label="Map file"
        title="Used to recognise demos of this map"
      />
      <input
        className={shortField}
        value={steamId}
        onChange={(e) => setSteamId(e.target.value)}
        placeholder="Steam leaderboard id (optional)"
        aria-label="Steam leaderboard id"
      />
      <button type="submit" className={button} disabled={busy}>
        Add
      </button>
      <button type="button" className={button} onClick={() => setOpen(false)}>
        Cancel
      </button>
      {failure && <span className={error}>{failure}</span>}
    </form>
  )
}
