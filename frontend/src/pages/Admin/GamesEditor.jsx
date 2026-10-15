import { useEffect, useMemo, useState } from "react";
import { EmptyState, Loading } from "../../components/ui";
import {
  adminCreateCategory,
  adminCreateChapter,
  adminCreateGame,
  adminCreateMap,
  adminDeleteCategory,
  adminDeleteChapter,
  adminDeleteGame,
  adminDeleteMap,
  adminLinkGames,
  adminLinkMap,
  adminSaveLayout,
  adminUnlinkGames,
  adminUnlinkMap,
  adminUpdateCategory,
  adminUpdateChapter,
  adminUpdateGame,
  adminUpdateMap,
  adminSetMapImage,
  adminRemoveMapImage,
  mapImageUrl,
  fetchCatalog,
} from "../../api/client";
import { applyCatalog, builtInImage, defaultModeLabel, gameKey } from "../../data/maps";
import { GAME_IDS } from "../../api/config";
import { bumpDataVersion } from "../../lib/dataVersion";
import "./GamesEditor.css";

// Admin editor for games, seasons, chapters, maps, categories and linked leaderboards. Maps
// are dragged between chapters (and chapters reordered) locally, then saved together with
// "Save layout". Linked maps share new runs: a run on one also counts on the other when it
// beats the player's best there.

const toInput = (ts) => (ts ? String(ts).slice(0, 16) : "");
const fromInput = (v) => (v ? `${v}:00` : null);
const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

export default function GamesEditor() {
  const [catalog, setCatalog] = useState(null);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(null);
  const [error, setError] = useState(null);

  const reload = async (select) => {
    try {
      const data = await fetchCatalog();
      setCatalog(data);
      // Keep the rest of the site in step with the edits.
      applyCatalog(data);
      data.forEach((g) => {
        GAME_IDS[gameKey(g)] = g.id;
      });
      bumpDataVersion();
      if (select !== undefined) setSelected(select);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  if (!catalog) return error ? <p className="ge-error">{error}</p> : <Loading />;
  const game = catalog.find((g) => g.id === selected);
  const allMaps = catalog.flatMap((g) => g.chapters.flatMap((c) => c.maps.map((m) => ({ ...m, game: g, multiplayer: c.is_multiplayer }))));

  return (
    <div className="ge">
      <aside className="ge-games">
        {catalog.map((g) => (
          <button key={g.id} type="button" className={`ge-game${g.id === selected ? " is-active" : ""}`} onClick={() => setSelected(g.id)}>
            <span>{g.name}</span>
            <small>
              {g.kind === "season" ? "Season" : "Game"}
              {g.hidden ? " · hidden" : ""}
            </small>
          </button>
        ))}
        <div className="ge-new">
          <button type="button" onClick={() => setCreating("game")}>
            + New game
          </button>
          <button type="button" onClick={() => setCreating("season")}>
            + New season
          </button>
        </div>
      </aside>
      <section className="ge-main">
        {creating ? (
          <NewGameForm
            kind={creating}
            catalog={catalog}
            onCancel={() => setCreating(null)}
            onCreated={(id) => {
              setCreating(null);
              reload(id);
            }}
          />
        ) : game ? (
          <GamePanel key={game.id} game={game} catalog={catalog} allMaps={allMaps} onChanged={reload} onDeleted={() => reload(null)} />
        ) : (
          <EmptyState>Pick a game, or create a game or season.</EmptyState>
        )}
      </section>
    </div>
  );
}

// Runs an API call with busy / error state.
function useAction() {
  const [state, setState] = useState({ busy: false, error: null });
  const run = async (fn) => {
    setState({ busy: true, error: null });
    try {
      const out = await fn();
      setState({ busy: false, error: null });
      return out;
    } catch (e) {
      setState({ busy: false, error: e.message });
      return undefined;
    }
  };
  return [state, run];
}

function NewGameForm({ kind, catalog, onCancel, onCreated }) {
  const season = kind === "season";
  const bases = catalog.filter((g) => g.kind === "game");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [base, setBase] = useState(bases[0]?.id ?? 1);
  const [starts, setStarts] = useState(new Date().toISOString().slice(0, 10) + "T00:00");
  const [ends, setEnds] = useState("");
  const [link, setLink] = useState(true);
  const [state, run] = useAction();
  const submit = async (e) => {
    e.preventDefault();
    const body = { name, slug };
    if (season) Object.assign(body, { base_game_id: Number(base), starts_at: fromInput(starts), ends_at: fromInput(ends), link_to_base: link });
    const out = await run(() => adminCreateGame(body));
    if (out) onCreated(out.id);
  };
  return (
    <form className="ge-card ge-form" onSubmit={submit}>
      <h3>{season ? "New season" : "New game"}</h3>
      {season && (
        <p className="ge-hint">
          A season copies a game's chapters and maps. With the maps linked, new runs set between the start and end count on the season's boards as
          well as the original ones (each board only takes improvements on the player's best there). Existing times aren't copied.
        </p>
      )}
      <label>
        <span>Name</span>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugEdited) setSlug(slugify(e.target.value));
          }}
          maxLength={80}
          required
          autoFocus
        />
      </label>
      <label>
        <span>Link name</span>
        <input
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugEdited(true);
          }}
          pattern="[a-z0-9][a-z0-9-]{1,31}"
          title="Lowercase letters, digits and dashes"
          required
        />
      </label>
      {season && (
        <>
          <label>
            <span>Map pool from</span>
            <select value={base} onChange={(e) => setBase(e.target.value)}>
              {bases.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <div className="ge-row">
            <label>
              <span>Starts (UTC)</span>
              <input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} required />
            </label>
            <label>
              <span>Ends (UTC, optional)</span>
              <input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
            </label>
          </div>
          <label className="ge-check">
            <input type="checkbox" checked={link} onChange={(e) => setLink(e.target.checked)} />
            Link the season's maps to {bases.find((g) => String(g.id) === String(base))?.name || "the base game"} (new runs count on both)
          </label>
        </>
      )}
      {state.error && <p className="ge-error">{state.error}</p>}
      <div className="ge-actions">
        <button type="button" onClick={onCancel} disabled={state.busy}>
          Cancel
        </button>
        <button type="submit" className="is-primary" disabled={state.busy}>
          {state.busy ? (season ? "Copying maps…" : "Creating…") : "Create"}
        </button>
      </div>
    </form>
  );
}

function GamePanel({ game, catalog, allMaps, onChanged, onDeleted }) {
  const season = game.kind === "season";
  const base = catalog.find((g) => g.id === game.base_game_id);
  const [name, setName] = useState(game.name);
  const [slug, setSlug] = useState(game.slug);
  const [starts, setStarts] = useState(toInput(game.starts_at));
  const [ends, setEnds] = useState(toInput(game.ends_at));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [state, run] = useAction();
  const builtin = game.id <= 2;

  const save = async (e) => {
    e.preventDefault();
    const changes = {};
    if (name !== game.name) changes.name = name;
    if (slug !== game.slug) changes.slug = slug;
    if (season && starts !== toInput(game.starts_at)) changes.starts_at = fromInput(starts);
    if (season && ends !== toInput(game.ends_at)) changes.ends_at = fromInput(ends);
    if (!Object.keys(changes).length) return;
    if ((await run(() => adminUpdateGame(game.id, changes))) !== undefined) onChanged();
  };

  return (
    <>
      <form className="ge-card ge-form" onSubmit={save}>
        <div className="ge-card-head">
          <h3>{game.name}</h3>
          <span className="ge-tag">{season ? `Season of ${base?.name || "?"}` : "Game"}</span>
        </div>
        <div className="ge-row">
          <label>
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </label>
          <label>
            <span>Link name</span>
            <input value={slug} onChange={(e) => setSlug(e.target.value)} disabled={builtin} />
          </label>
        </div>
        {season && (
          <div className="ge-row">
            <label>
              <span>Starts (UTC)</span>
              <input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
            </label>
            <label>
              <span>Ends (UTC, optional)</span>
              <input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
            </label>
          </div>
        )}
        {season && <p className="ge-hint">The dates decide which new runs count for the season; times already recorded stay.</p>}
        {state.error && <p className="ge-error">{state.error}</p>}
        <div className="ge-actions">
          {!builtin && (
            <button
              type="button"
              className="is-danger"
              disabled={state.busy}
              onClick={async () => {
                if (!confirmDelete) return setConfirmDelete(true);
                if ((await run(() => adminDeleteGame(game.id))) !== undefined) onDeleted();
              }}
              onBlur={() => setConfirmDelete(false)}
            >
              {confirmDelete ? "Click again to delete" : `Delete ${season ? "season" : "game"}`}
            </button>
          )}
          <button
            type="button"
            disabled={state.busy}
            onClick={async () => {
              if ((await run(() => adminUpdateGame(game.id, { hidden: !game.hidden }))) !== undefined) onChanged();
            }}
          >
            {game.hidden ? "Show on the site" : "Hide from the site"}
          </button>
          <button type="submit" className="is-primary" disabled={state.busy}>
            Save
          </button>
        </div>
      </form>
      <GameModes game={game} onChanged={onChanged} />
      <GameLinks game={game} catalog={catalog} allMaps={allMaps} onChanged={onChanged} />
      {season ? <SeasonPool game={game} base={base} /> : <LayoutEditor game={game} allMaps={allMaps} onChanged={onChanged} />}
    </>
  );
}

// A game's modes (boards): the ones its chapters use plus any added here that no chapter uses
// yet, each with what the site calls it ("sp" is "Singleplayer" unless renamed).
const gameModes = (game) => [...new Set([...game.chapters.map((c) => c.game_mode), ...Object.keys(game.mode_names || {})])];
const modeLabel = (game, mode) => game.mode_names?.[mode] || defaultModeLabel(mode);
const modeKey = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);

function GameModes({ game, onChanged }) {
  const season = game.kind === "season";
  const modes = gameModes(game);
  if (!modes.length && season) return null;
  return (
    <div className="ge-card">
      <div className="ge-card-head">
        <h3>Game modes</h3>
      </div>
      <p className="ge-hint">
        Each mode is its own board, with the chapters put in it. Leave a name empty to use the default.{!season && " A new mode shows on the site once a chapter in it has maps."}
      </p>
      <div className="ge-modes">
        {modes.map((mode) => (
          <ModeName key={mode} game={game} mode={mode} chapters={game.chapters.filter((c) => c.game_mode === mode).length} onChanged={onChanged} />
        ))}
      </div>
      {!season && <AddMode game={game} modes={modes} onChanged={onChanged} />}
    </div>
  );
}

function ModeName({ game, mode, chapters, onChanged }) {
  const saved = game.mode_names?.[mode] || "";
  const [name, setName] = useState(saved);
  const [state, run] = useAction();
  const save = async (value) => {
    if ((await run(() => adminUpdateGame(game.id, { mode_name: { mode, name: value } }))) !== undefined) onChanged();
  };
  return (
    <form
      className="ge-inline ge-mode"
      onSubmit={(e) => {
        e.preventDefault();
        save(name);
      }}
    >
      <span className="ge-mode-key">
        {mode}
        <small>{chapters ? `${chapters} chapter${chapters === 1 ? "" : "s"}` : "no chapters yet"}</small>
      </span>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={defaultModeLabel(mode)} maxLength={40} aria-label={`Name for ${mode}`} />
      <button type="submit" disabled={state.busy || name.trim() === saved}>
        Save
      </button>
      {saved && chapters > 0 && (
        <button
          type="button"
          disabled={state.busy}
          onClick={() => {
            setName("");
            save("");
          }}
        >
          Reset
        </button>
      )}
      {!chapters && (
        <button type="button" className="is-danger" disabled={state.busy} onClick={() => save("")}>
          Remove
        </button>
      )}
      {state.error && <span className="ge-error">{state.error}</span>}
    </form>
  );
}

function AddMode({ game, modes, onChanged }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [state, run] = useAction();
  if (!open)
    return (
      <button type="button" className="ge-add" onClick={() => setOpen(true)}>
        + Add mode
      </button>
    );
  const taken = modes.includes(key);
  return (
    <form
      className="ge-inline ge-add-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if ((await run(() => adminUpdateGame(game.id, { mode_name: { mode: key, name } }))) !== undefined) {
          setOpen(false);
          setName("");
          setKey("");
          setKeyEdited(false);
          onChanged();
        }
      }}
    >
      <input
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (!keyEdited) setKey(modeKey(e.target.value));
        }}
        placeholder="Mode name"
        maxLength={40}
        required
        autoFocus
      />
      <input
        value={key}
        onChange={(e) => {
          setKey(modeKey(e.target.value));
          setKeyEdited(true);
        }}
        placeholder="key"
        title="Short key for the mode, used in links (lowercase letters, digits, underscores)"
        className="ge-short"
        required
      />
      <button type="submit" disabled={state.busy || !key || taken}>
        Add
      </button>
      <button type="button" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {taken && <span className="ge-error">This game already has a mode with that key.</span>}
      {state.error && <span className="ge-error">{state.error}</span>}
    </form>
  );
}

// Choosing a chapter's mode: the game's modes, and Singleplayer / Cooperative if it has neither.
function ModeSelect({ game, value, onChange }) {
  const modes = [...new Set([...gameModes(game), "sp", "coop", value])];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Mode" title="The mode (board) this chapter counts for">
      {modes.map((m) => (
        <option key={m} value={m}>
          {modeLabel(game, m)} ({m})
        </option>
      ))}
    </select>
  );
}

// The games this game's maps are linked to, with bulk link / unlink.
function GameLinks({ game, catalog, allMaps, onChanged }) {
  const own = game.chapters.flatMap((c) => c.maps);
  const gameOf = Object.fromEntries(allMaps.map((m) => [m.steam_id, m.game]));
  const counts = {};
  own.forEach((m) =>
    m.links.forEach((l) => {
      const g = gameOf[l];
      if (g) counts[g.id] = (counts[g.id] || 0) + 1;
    }),
  );
  const others = catalog.filter((g) => g.id !== game.id);
  // Nothing picked until staff choose a game (no game is preselected).
  const [target, setTarget] = useState("");
  const [state, run] = useAction();
  return (
    <div className="ge-card">
      <h3>Linked leaderboards</h3>
      <p className="ge-hint">
        A new run on a linked map also counts on the other map when it beats the player's best there. Linking doesn't copy existing times.
      </p>
      <div className="ge-links">
        {Object.entries(counts).map(([id, n]) => {
          const g = catalog.find((x) => String(x.id) === id);
          return (
            <span key={id} className="ge-cat">
              {g?.name} <small>{n} maps</small>
              <button
                type="button"
                className="ge-link is-danger"
                disabled={state.busy}
                onClick={async () => {
                  if ((await run(() => adminUnlinkGames(game.id, Number(id)))) !== undefined) onChanged();
                }}
              >
                Unlink all
              </button>
            </span>
          );
        })}
        {!Object.keys(counts).length && <span className="ge-hint">Not linked to anything.</span>}
      </div>
      {others.length > 0 && (
        <div className="ge-inline ge-add-form">
          <select value={target} onChange={(e) => setTarget(e.target.value ? Number(e.target.value) : "")}>
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
            disabled={state.busy || target === ""}
            onClick={async () => {
              if ((await run(() => adminLinkGames(game.id, target))) !== undefined) {
                setTarget("");
                onChanged();
              }
            }}
          >
            Link matching maps
          </button>
          <span className="ge-hint">Pairs maps that copy the same map or use the same map file.</span>
        </div>
      )}
      {state.error && <p className="ge-error">{state.error}</p>}
    </div>
  );
}

function SeasonPool({ game, base }) {
  const maps = game.chapters.reduce((n, c) => n + c.maps.length, 0);
  return (
    <div className="ge-card">
      <h3>Map pool</h3>
      <p className="ge-hint">
        {maps} maps in {game.chapters.length} chapters, copied from {base?.name || "the base game"}. Edit maps on the base game.
      </p>
      <div className="ge-chapters is-readonly">
        {game.chapters.map((c) => (
          <div key={c.id} className="ge-chapter">
            <div className="ge-chapter-head">
              <strong>{c.name}</strong>
              <small>{c.game_mode}</small>
            </div>
            <div className="ge-maps">
              {c.maps.map((m) => (
                <span key={m.steam_id} className="ge-map">
                  {m.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Chapters with draggable maps. Edits to names happen immediately; moving maps and
// reordering chapters is saved with "Save layout".
function LayoutEditor({ game, allMaps, onChanged }) {
  const initial = useMemo(() => game.chapters.map((c) => ({ id: c.id, maps: c.maps.map((m) => m.steam_id) })), [game]);
  const [layout, setLayout] = useState(initial);
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const [openMap, setOpenMap] = useState(null);
  const [state, run] = useAction();
  useEffect(() => setLayout(initial), [initial]);
  const dirty = JSON.stringify(layout) !== JSON.stringify(initial);
  const chapterById = Object.fromEntries(game.chapters.map((c) => [c.id, c]));
  const mapById = Object.fromEntries(game.chapters.flatMap((c) => c.maps.map((m) => [m.steam_id, m])));

  const moveMap = (steamId, toChapter, beforeId) => {
    const from = chapterById[layout.find((c) => c.maps.includes(steamId))?.id];
    if (from && from.is_multiplayer !== chapterById[toChapter].is_multiplayer) return;
    setLayout((l) => {
      const without = l.map((c) => ({ ...c, maps: c.maps.filter((m) => m !== steamId) }));
      return without.map((c) => {
        if (c.id !== toChapter) return c;
        const maps = [...c.maps];
        const at = beforeId ? maps.indexOf(beforeId) : -1;
        maps.splice(at < 0 ? maps.length : at, 0, steamId);
        return { ...c, maps };
      });
    });
  };
  const moveChapter = (index, delta) =>
    setLayout((l) => {
      const next = [...l];
      const [c] = next.splice(index, 1);
      next.splice(Math.max(0, Math.min(next.length, index + delta)), 0, c);
      return next;
    });

  return (
    <div className="ge-card">
      <div className="ge-card-head">
        <h3>Chapters and maps</h3>
        <div className="ge-actions">
          {dirty && (
            <button type="button" onClick={() => setLayout(initial)} disabled={state.busy}>
              Undo changes
            </button>
          )}
          <button
            type="button"
            className="is-primary"
            disabled={!dirty || state.busy}
            onClick={async () => {
              if ((await run(() => adminSaveLayout(game.id, layout))) !== undefined) onChanged();
            }}
          >
            {state.busy ? "Saving…" : "Save layout"}
          </button>
        </div>
      </div>
      <p className="ge-hint">Drag maps between chapters (singleplayer and co-op maps stay in their kind of chapter), use the arrows to reorder chapters, then save.</p>
      {state.error && <p className="ge-error">{state.error}</p>}
      <div className="ge-chapters">
        {layout.map((entry, i) => {
          const chapter = chapterById[entry.id];
          return (
            <div
              key={entry.id}
              className={`ge-chapter${over === entry.id ? " is-over" : ""}`}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                setOver(entry.id);
              }}
              onDragLeave={() => setOver((o) => (o === entry.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                if (drag) moveMap(drag, entry.id, null);
                setDrag(null);
                setOver(null);
              }}
            >
              <ChapterHead chapter={chapter} game={game} index={i} count={layout.length} onMove={moveChapter} onChanged={onChanged} empty={!entry.maps.length && !chapter.maps.length} />
              <div className="ge-maps">
                {entry.maps.map((id) => (
                  <button
                    key={id}
                    type="button"
                    draggable
                    className={`ge-map${drag === id ? " is-dragging" : ""}${openMap === id ? " is-open" : ""}`}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      setDrag(id);
                    }}
                    onDragEnd={() => {
                      setDrag(null);
                      setOver(null);
                    }}
                    onDragOver={(e) => drag && e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (drag && drag !== id) moveMap(drag, entry.id, id);
                      setDrag(null);
                      setOver(null);
                    }}
                    onClick={() => setOpenMap(openMap === id ? null : id)}
                    title="Drag to move; click to edit"
                  >
                    {mapById[id]?.name || id}
                  </button>
                ))}
                <AddMap chapter={chapter} onChanged={onChanged} />
              </div>
              {openMap && entry.maps.includes(openMap) && mapById[openMap] && (
                <MapEditor
                  key={openMap}
                  map={mapById[openMap]}
                  multiplayer={chapter.is_multiplayer}
                  game={game}
                  allMaps={allMaps}
                  onChanged={onChanged}
                  onDeleted={() => setOpenMap(null)}
                />
              )}
            </div>
          );
        })}
      </div>
      <AddChapter game={game} onChanged={onChanged} />
    </div>
  );
}

function ChapterHead({ chapter, game, index, count, onMove, onChanged, empty }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(chapter.name || "");
  const [mode, setMode] = useState(chapter.game_mode);
  const [state, run] = useAction();
  return (
    <div className="ge-chapter-head">
      <span className="ge-order">
        <button type="button" onClick={() => onMove(index, -1)} disabled={index === 0} aria-label="Move chapter up">
          ▲
        </button>
        <button type="button" onClick={() => onMove(index, 1)} disabled={index === count - 1} aria-label="Move chapter down">
          ▼
        </button>
      </span>
      {editing ? (
        <form
          className="ge-inline"
          onSubmit={async (e) => {
            e.preventDefault();
            const changes = { name };
            if (mode !== chapter.game_mode) changes.game_mode = mode;
            if ((await run(() => adminUpdateChapter(chapter.id, changes))) !== undefined) {
              setEditing(false);
              onChanged();
            }
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} autoFocus />
          <ModeSelect game={game} value={mode} onChange={setMode} />
          <button type="submit" disabled={state.busy}>
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setMode(chapter.game_mode);
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <>
          <strong>{chapter.name}</strong>
          <small title={`Mode "${chapter.game_mode}": rename it under Game modes`}>
            {modeLabel(game, chapter.game_mode)}
            {chapter.is_multiplayer ? " · co-op" : ""}
          </small>
          <button type="button" className="ge-link" onClick={() => setEditing(true)}>
            Edit
          </button>
          {empty && (
            <button
              type="button"
              className="ge-link is-danger"
              onClick={async () => {
                if ((await run(() => adminDeleteChapter(chapter.id))) !== undefined) onChanged();
              }}
            >
              Delete
            </button>
          )}
        </>
      )}
      {state.error && <span className="ge-error">{state.error}</span>}
    </div>
  );
}

function AddChapter({ game, onChanged }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [multi, setMulti] = useState(false);
  const [mode, setMode] = useState(() => gameModes(game)[0] || "sp");
  const [state, run] = useAction();
  if (!open)
    return (
      <button type="button" className="ge-add" onClick={() => setOpen(true)}>
        + Add chapter
      </button>
    );
  return (
    <form
      className="ge-inline ge-add-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if ((await run(() => adminCreateChapter(game.id, { name, game_mode: mode, is_multiplayer: multi }))) !== undefined) {
          setOpen(false);
          setName("");
          onChanged();
        }
      }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Chapter name" maxLength={50} required autoFocus />
      <label className="ge-check">
        <input
          type="checkbox"
          checked={multi}
          onChange={(e) => {
            setMulti(e.target.checked);
            if (mode === "sp" || mode === "coop") setMode(e.target.checked ? "coop" : "sp");
          }}
        />
        Co-op
      </label>
      <ModeSelect game={game} value={mode} onChange={setMode} />
      <button type="submit" disabled={state.busy}>
        Add
      </button>
      <button type="button" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {state.error && <span className="ge-error">{state.error}</span>}
    </form>
  );
}

function AddMap({ chapter, onChanged }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [steamId, setSteamId] = useState("");
  const [bsp, setBsp] = useState("");
  const [state, run] = useAction();
  if (!open)
    return (
      <button type="button" className="ge-map ge-map-add" onClick={() => setOpen(true)}>
        + Map
      </button>
    );
  return (
    <form
      className="ge-inline ge-add-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if ((await run(() => adminCreateMap(chapter.id, { name, steam_id: steamId || null, bsp_name: bsp || null }))) !== undefined) {
          setOpen(false);
          setName("");
          setSteamId("");
          setBsp("");
          onChanged();
        }
      }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Map name" maxLength={50} required autoFocus />
      <input value={bsp} onChange={(e) => setBsp(e.target.value)} placeholder="Map file (sp_a1_intro1)" title="Used to recognise demos of this map" />
      <input value={steamId} onChange={(e) => setSteamId(e.target.value)} placeholder="Steam leaderboard id (optional)" className="ge-short" />
      <button type="submit" disabled={state.busy}>
        Add
      </button>
      <button type="button" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {state.error && <span className="ge-error">{state.error}</span>}
    </form>
  );
}

// The map's picture: its uploaded image if it has one, else the site's built-in one (if any).
function MapImage({ map, onChanged }) {
  const [state, run] = useAction();
  const builtIn = builtInImage(map.source_map || map.steam_id);
  const src = map.image_version ? mapImageUrl(map.steam_id, map.image_version) : builtIn;
  return (
    <div className="ge-cats ge-image-row">
      <span className="ge-hint">Image</span>
      {src ? <img className="ge-map-thumb" src={src} alt="" /> : <span className="ge-hint">None</span>}
      <label className="ge-upload">
        {state.busy ? "Uploading…" : map.image_version ? "Replace image" : "Upload image"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={state.busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file && (await run(() => adminSetMapImage(map.steam_id, file))) !== undefined) onChanged();
          }}
        />
      </label>
      {map.image_version && (
        <button
          type="button"
          className="ge-link is-danger"
          disabled={state.busy}
          onClick={async () => {
            if ((await run(() => adminRemoveMapImage(map.steam_id))) !== undefined) onChanged();
          }}
        >
          {builtIn ? "Use the built-in image" : "Remove image"}
        </button>
      )}
      <span className="ge-hint">PNG, JPEG or WebP, up to 5 MB.</span>
      {state.error && <span className="ge-error">{state.error}</span>}
    </div>
  );
}

function MapEditor({ map, multiplayer, game, allMaps, onChanged, onDeleted }) {
  const [name, setName] = useState(map.name);
  const [bsp, setBsp] = useState(map.bsp_name || "");
  const [newCat, setNewCat] = useState("");
  const [linkTo, setLinkTo] = useState("");
  const byId = Object.fromEntries(allMaps.map((m) => [m.steam_id, m]));
  // Maps of other games of the same kind, same-file maps first.
  const linkable = allMaps
    .filter((m) => m.game.id !== game.id && m.multiplayer === multiplayer && !map.links.includes(m.steam_id))
    .sort((a, b) => (b.bsp_name === map.bsp_name) - (a.bsp_name === map.bsp_name));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [state, run] = useAction();
  const act = async (fn, after) => {
    if ((await run(fn)) !== undefined) {
      after?.();
      onChanged();
    }
  };
  return (
    <div className="ge-map-editor">
      <form
        className="ge-inline"
        onSubmit={(e) => {
          e.preventDefault();
          const changes = {};
          if (name !== map.name) changes.name = name;
          if (bsp !== (map.bsp_name || "")) changes.bsp_name = bsp || null;
          if (Object.keys(changes).length) act(() => adminUpdateMap(map.steam_id, changes));
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} aria-label="Map name" />
        <input value={bsp} onChange={(e) => setBsp(e.target.value)} placeholder="Map file" aria-label="Map file" />
        <button type="submit" disabled={state.busy}>
          Save
        </button>
        <code className="ge-id">{map.steam_id}</code>
      </form>
      <MapImage map={map} onChanged={onChanged} />
      <div className="ge-cats">
        <span className="ge-hint">Categories</span>
        {map.categories.map((c) => (
          <CategoryChip key={c.id} category={c} main={c.id === map.default_cat_id} onMain={() => act(() => adminUpdateMap(map.steam_id, { default_cat_id: c.id }))} onChanged={onChanged} />
        ))}
        <form
          className="ge-inline"
          onSubmit={(e) => {
            e.preventDefault();
            if (newCat.trim()) act(() => adminCreateCategory(map.steam_id, newCat.trim()), () => setNewCat(""));
          }}
        >
          <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category" className="ge-short" maxLength={100} />
          <button type="submit" disabled={state.busy || !newCat.trim()}>
            Add
          </button>
        </form>
      </div>
      <div className="ge-cats">
        <span className="ge-hint">Linked to</span>
        {map.links.map((l) => (
          <span key={l} className="ge-cat">
            {byId[l] ? `${byId[l].game.name} · ${byId[l].name}` : l}
            <button type="button" className="ge-link is-danger" onClick={() => act(() => adminUnlinkMap(map.steam_id, l))}>
              Unlink
            </button>
          </span>
        ))}
        <form
          className="ge-inline"
          onSubmit={(e) => {
            e.preventDefault();
            if (linkTo) act(() => adminLinkMap(map.steam_id, linkTo), () => setLinkTo(""));
          }}
        >
          <select value={linkTo} onChange={(e) => setLinkTo(e.target.value)} aria-label="Map to link">
            <option value="">Link to a map…</option>
            {linkable.map((m) => (
              <option key={m.steam_id} value={m.steam_id}>
                {m.game.name} · {m.name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={state.busy || !linkTo}>
            Link
          </button>
        </form>
      </div>
      <div className="ge-actions">
        <button
          type="button"
          className="is-danger"
          disabled={state.busy}
          onClick={() => (confirmDelete ? act(() => adminDeleteMap(map.steam_id), onDeleted) : setConfirmDelete(true))}
          onBlur={() => setConfirmDelete(false)}
        >
          {confirmDelete ? "Click again to delete" : "Delete map"}
        </button>
      </div>
      {state.error && <p className="ge-error">{state.error}</p>}
    </div>
  );
}

function CategoryChip({ category, main, onMain, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [state, run] = useAction();
  if (editing)
    return (
      <form
        className="ge-inline"
        onSubmit={async (e) => {
          e.preventDefault();
          if ((await run(() => adminUpdateCategory(category.id, name))) !== undefined) {
            setEditing(false);
            onChanged();
          }
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} className="ge-short" maxLength={100} autoFocus />
        <button type="submit" disabled={state.busy}>
          Save
        </button>
        {state.error && <span className="ge-error">{state.error}</span>}
      </form>
    );
  return (
    <span className={`ge-cat${main ? " is-main" : ""}`}>
      {category.name}
      {main ? (
        <small>main</small>
      ) : (
        <>
          <button type="button" className="ge-link" onClick={onMain}>
            Make main
          </button>
          <button
            type="button"
            className="ge-link is-danger"
            onClick={async () => {
              if ((await run(() => adminDeleteCategory(category.id))) !== undefined) onChanged();
            }}
          >
            Delete
          </button>
        </>
      )}
      <button type="button" className="ge-link" onClick={() => setEditing(true)}>
        Rename
      </button>
      {state.error && <span className="ge-error">{state.error}</span>}
    </span>
  );
}
