import { cn } from 'cn'
import { useState } from 'react'
import { apiUrl } from '@/lib/api-client'
import { builtInImage, type CatalogCategoryRaw, type CatalogGameRaw, type CatalogMapRaw } from '@/lib/catalog'
import {
  createCategory,
  deleteCategory,
  deleteMap,
  linkMap,
  removeMapImage,
  setMapImage,
  unlinkMap,
  updateCategory,
  updateMap,
} from '../../api/catalog-editor'
import { ImageRow } from './image-row'
import {
  actions,
  button,
  chip,
  chips,
  danger,
  error,
  field,
  hint,
  inline,
  shortField,
  textButton,
  textDanger,
} from './styles'
import type { EditorMap, OnChanged } from './types'
import { useAction } from './use-action'

/** One map: its name and map file, image, categories (one is the main board) and links. */
export function MapEditor({
  map,
  multiplayer,
  game,
  allMaps,
  onChanged,
  onDeleted,
}: {
  map: CatalogMapRaw
  multiplayer: boolean
  game: CatalogGameRaw
  allMaps: EditorMap[]
  onChanged: OnChanged
  onDeleted: () => void
}) {
  const [name, setName] = useState(map.name)
  const [bsp, setBsp] = useState(map.bsp_name || '')
  const [newCat, setNewCat] = useState('')
  const [linkTo, setLinkTo] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { busy, error: failure, run } = useAction()
  const byId = new Map(allMaps.map((m) => [m.steam_id, m]))
  // Maps of other games of the same kind, same-file maps first.
  const linkable = allMaps
    .filter((m) => m.game.id !== game.id && m.multiplayer === multiplayer && !map.links.includes(m.steam_id))
    .sort((a, b) => Number(b.bsp_name === map.bsp_name) - Number(a.bsp_name === map.bsp_name))
  const act = async (fn: () => Promise<unknown>, after?: () => void) => {
    if ((await run(fn)) !== undefined) {
      after?.()
      void onChanged()
    }
  }
  const builtIn = builtInImage(map.source_map || map.steam_id)

  return (
    <div
      role="region"
      aria-label={`Edit ${map.name}`}
      className="mt-2.5 flex flex-col gap-2.5 rounded-md border border-line bg-row-alt px-3 py-2.5"
    >
      <form
        className={inline}
        onSubmit={(e) => {
          e.preventDefault()
          const changes: { name?: string; bsp_name?: string | null } = {}
          if (name !== map.name) changes.name = name
          if (bsp !== (map.bsp_name || '')) changes.bsp_name = bsp || null
          if (Object.keys(changes).length) void act(() => updateMap(map.steam_id, changes))
        }}
      >
        <input
          className={field}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
          aria-label="Map name"
        />
        <input
          className={field}
          value={bsp}
          onChange={(e) => setBsp(e.target.value)}
          placeholder="Map file"
          aria-label="Map file"
        />
        <button type="submit" className={button} disabled={busy}>
          Save
        </button>
        <code className="text-[13px] text-text-muted">{map.steam_id}</code>
      </form>
      <ImageRow
        label="Image"
        src={
          map.image_version
            ? apiUrl(`/maps/${encodeURIComponent(map.steam_id)}/image`, { v: map.image_version })
            : builtIn
        }
        uploaded={Boolean(map.image_version)}
        builtIn={Boolean(builtIn)}
        thumb="image"
        emptyText="None"
        note="PNG, JPEG or WebP, up to 5 MB."
        onUpload={(file) => setMapImage(map.steam_id, file)}
        onRemove={() => removeMapImage(map.steam_id)}
        onChanged={() => void onChanged()}
      />
      <div className={chips}>
        <span className={hint}>Categories</span>
        {map.categories.map((c) => (
          <CategoryChip
            key={c.id}
            category={c}
            main={c.id === map.default_cat_id}
            onMain={() => void act(() => updateMap(map.steam_id, { default_cat_id: c.id }))}
            onChanged={onChanged}
          />
        ))}
        <form
          className={inline}
          onSubmit={(e) => {
            e.preventDefault()
            if (newCat.trim())
              void act(
                () => createCategory(map.steam_id, newCat.trim()),
                () => setNewCat(''),
              )
          }}
        >
          <input
            className={shortField}
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            placeholder="New category"
            aria-label="New category"
            maxLength={100}
          />
          <button type="submit" className={button} disabled={busy || !newCat.trim()}>
            Add
          </button>
        </form>
      </div>
      <div className={chips}>
        <span className={hint}>Linked to</span>
        {map.links.map((l) => {
          const other = byId.get(l)
          return (
            <span key={l} className={chip}>
              {other ? `${other.game.name} · ${other.name}` : l}
              <button
                type="button"
                className={textDanger}
                onClick={() => void act(() => unlinkMap(map.steam_id, l))}
              >
                Unlink
              </button>
            </span>
          )
        })}
        <form
          className={inline}
          onSubmit={(e) => {
            e.preventDefault()
            if (linkTo)
              void act(
                () => linkMap(map.steam_id, linkTo),
                () => setLinkTo(''),
              )
          }}
        >
          <select
            className={field}
            value={linkTo}
            onChange={(e) => setLinkTo(e.target.value)}
            aria-label="Map to link"
          >
            <option value="">Link to a map…</option>
            {linkable.map((m) => (
              <option key={m.steam_id} value={m.steam_id}>
                {m.game.name} · {m.name}
              </option>
            ))}
          </select>
          <button type="submit" className={button} disabled={busy || !linkTo}>
            Link
          </button>
        </form>
      </div>
      <div className={actions}>
        <button
          type="button"
          className={danger}
          disabled={busy}
          onClick={() =>
            confirmDelete ? void act(() => deleteMap(map.steam_id), onDeleted) : setConfirmDelete(true)
          }
          onBlur={() => setConfirmDelete(false)}
        >
          {confirmDelete ? 'Click again to delete' : 'Delete map'}
        </button>
      </div>
      {failure && <p className={error}>{failure}</p>}
    </div>
  )
}

function CategoryChip({
  category,
  main,
  onMain,
  onChanged,
}: {
  category: CatalogCategoryRaw
  main: boolean
  onMain: () => void
  onChanged: OnChanged
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const { busy, error: failure, run } = useAction()
  if (editing)
    return (
      <form
        className={inline}
        onSubmit={async (e) => {
          e.preventDefault()
          if ((await run(() => updateCategory(category.id, name))) !== undefined) {
            setEditing(false)
            void onChanged()
          }
        }}
      >
        <input
          className={shortField}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Category name"
          maxLength={100}
          autoFocus
        />
        <button type="submit" className={button} disabled={busy}>
          Save
        </button>
        {failure && <span className={error}>{failure}</span>}
      </form>
    )
  return (
    <span className={cn(chip, main && 'border-brand')}>
      {category.name}
      {main ? (
        <small className="text-xs text-brand-light">main</small>
      ) : (
        <>
          <button type="button" className={textButton} onClick={onMain}>
            Make main
          </button>
          <button
            type="button"
            className={textDanger}
            onClick={async () => {
              if ((await run(() => deleteCategory(category.id))) !== undefined) void onChanged()
            }}
          >
            Delete
          </button>
        </>
      )}
      <button type="button" className={textButton} onClick={() => setEditing(true)}>
        Rename
      </button>
      {failure && <span className={error}>{failure}</span>}
    </span>
  )
}
