import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CloseIcon, UploadIcon } from "./Icons";
import { previewDemo, submitRun } from "../api/client";
import { GAMES, findMap, getMap, mapPath, mapsForMode, MODE_LABELS } from "../data/maps";
import { formatScore } from "../lib/format";
import { isRoleAdmin } from "../hooks/useCurrentUser";
import "./SubmitRun.css";

const boardMap = (m) => findMap(m.steam_id) || getMap(m.steam_id, m.game_id === 2 ? "mel" : "portal2");

// Map choices for admins, grouped by board. Seasons are left out: runs go on the original map
// and count for the season automatically.
const mapGroups = () =>
  Object.values(GAMES)
    .filter((g) => g.kind !== "season")
    .flatMap((g) =>
      g.modes.map((mode) => ({
        mode,
        label: g.id === "portal2" ? MODE_LABELS[mode] : `${g.label} · ${MODE_LABELS[mode] || mode}`,
        maps: mapsForMode(mode),
      })),
    );

function DemoDrop({ file, onFile, busy }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const drop = (e) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };
  return (
    <button
      type="button"
      className={`sr-drop${over ? " is-over" : ""}${file ? " has-file" : ""}`}
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      disabled={busy}
    >
      <UploadIcon className="sr-drop-icon" />
      {file ? (
        <>
          <strong>{file.name}</strong>
          <span>Drop another demo or click to change</span>
        </>
      ) : (
        <>
          <strong>Drop your demo here</strong>
          <span>or click to choose a .dem file</span>
        </>
      )}
      <input
        ref={input}
        type="file"
        accept=".dem"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) onFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
    </button>
  );
}

function DemoSummary({ preview, melMode, setMelMode, user }) {
  const maps = preview.maps || [];
  const chosen = maps.length > 1 ? maps.find((m) => m.game_mode === melMode) || maps[0] : maps[0];
  const map = chosen && boardMap(chosen);
  const others = (preview.players || []).filter((p) => p.steamId !== user.profileNumber);
  const inDemo = (preview.players || []).some((p) => p.steamId === user.profileNumber);
  return (
    <dl className="sr-summary">
      <div>
        <dt>Map</dt>
        <dd>
          {map ? <Link to={mapPath(map)}>{map.title}</Link> : null}
          {map && map.game === "mel" && <span className="sr-muted">Mel · {MODE_LABELS[map.mode] || map.mode}</span>}
          {map ? null : <span className="sr-bad">{preview.mapName ? `${preview.mapName} isn't on the boards` : "Unknown"}</span>}
          {maps.length > 1 && (
            <span className="sr-seg" role="group" aria-label="Mel board">
              {maps.map((m) => (
                <button key={m.game_mode} type="button" className={m.game_mode === (chosen?.game_mode) ? "is-active" : ""} onClick={() => setMelMode(m.game_mode)}>
                  {MODE_LABELS[m.game_mode] || m.game_mode}
                </button>
              ))}
            </span>
          )}
        </dd>
      </div>
      <div>
        <dt>Time</dt>
        <dd className="sr-time">{preview.timeScore ? formatScore(preview.timeScore) : <span className="sr-bad">No finished run in this demo</span>}</dd>
      </div>
      {chosen?.is_coop && inDemo && (
        <div>
          <dt>Partner</dt>
          <dd>{others.length ? others.map((p) => p.name || p.steamId).join(", ") : <span className="sr-muted">Not found (submitted solo)</span>}</dd>
        </div>
      )}
      {!inDemo && (
        <div>
          <dt>Players</dt>
          <dd>{(preview.players || []).map((p) => p.name || p.steamId).join(", ") || <span className="sr-muted">None found</span>}</dd>
        </div>
      )}
      {!inDemo && (
        <p className="sr-warn">
          {isRoleAdmin(user) ? "You aren't in this demo. Enter the player's SteamID below to submit it for them." : "You aren't in this demo. You can only submit your own runs."}
        </p>
      )}
    </dl>
  );
}

function AdminFields({ fields, set }) {
  return (
    <details className="sr-admin">
      <summary>Manual entry (admin)</summary>
      <p className="sr-muted">Anything entered here replaces what the demo says. A demo is optional. Manual entries are recorded in the audit log.</p>
      <label>
        <span>Map</span>
        <select value={fields.map_id} onChange={(e) => set("map_id", e.target.value)}>
          <option value="">From the demo</option>
          {mapGroups().map((g) => (
            <optgroup key={g.mode} label={g.label}>
              {g.maps.map((m) => (
                <option key={`${m.game}:${m.id}`} value={m.id}>
                  {m.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label>
        <span>Time</span>
        <input value={fields.time} onChange={(e) => set("time", e.target.value)} placeholder="1:23.45" inputMode="decimal" />
      </label>
      <label>
        <span>Player SteamID</span>
        <input value={fields.profile_number} onChange={(e) => set("profile_number", e.target.value)} placeholder="You" inputMode="numeric" />
      </label>
      <label>
        <span>Partner SteamID</span>
        <input value={fields.partner} onChange={(e) => set("partner", e.target.value)} placeholder="From the demo (co-op)" inputMode="numeric" />
      </label>
    </details>
  );
}

const EMPTY = { youtube: "", comment: "", map_id: "", time: "", profile_number: "", partner: "" };

export default function SubmitRun({ user, onClose }) {
  const admin = isRoleAdmin(user);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [reading, setReading] = useState(false);
  const [melMode, setMelMode] = useState("story");
  const [fields, setFields] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null);
  const set = (k, v) => setFields((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !sending && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, sending]);

  const chooseFile = async (f) => {
    setFile(f);
    setPreview(null);
    setError(null);
    if (!/\.dem$/i.test(f.name)) {
      setError("Choose a .dem file.");
      return;
    }
    setReading(true);
    try {
      setPreview(await previewDemo(f));
    } catch (e) {
      setError(e.message);
    } finally {
      setReading(false);
    }
  };

  const manual = admin && (fields.map_id || fields.time || fields.profile_number || fields.partner);
  const inDemo = preview?.players?.some((p) => p.steamId === user.profileNumber);
  const demoOk = preview && preview.maps?.length > 0 && preview.timeScore > 0 && (inDemo || admin);
  const canSubmit = !sending && !reading && (manual ? fields.map_id || preview : demoOk);

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const sendFields = { youtube: fields.youtube, comment: fields.comment, mel_mode: preview?.maps?.length > 1 ? melMode : "" };
      if (admin) Object.assign(sendFields, { map_id: fields.map_id, time: fields.time, profile_number: fields.profile_number, partner: fields.partner });
      setDone(await submitRun(file, sendFields));
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const doneMap = done && findMap(done.map_id);

  return (
    <div className="sr-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !sending && onClose()}>
      <div className="sr-dialog" role="dialog" aria-modal="true" aria-labelledby="sr-title">
        <header className="sr-head">
          <h2 id="sr-title">Submit run</h2>
          <button type="button" className="sr-close" onClick={onClose} aria-label="Close" disabled={sending}>
            <CloseIcon />
          </button>
        </header>
        {done ? (
          <div className="sr-done">
            <p>
              <strong>{formatScore(done.score)}</strong> on {doneMap ? <Link to={mapPath(doneMap)} onClick={onClose}>{done.map_name}</Link> : done.map_name}{" "}
              {done.waiting_for_partner ? "has been recorded." : "is on the boards."}
            </p>
            {done.waiting_for_partner && (
              <p className="sr-muted">
                It's pending until your partner adds their demo too: they can submit it here, or add it from the run's
                details.
              </p>
            )}
            {done.boards?.length > 1 && (
              <p className="sr-muted">
                Counted on: {done.boards.join(", ")}
              </p>
            )}
            <div className="sr-actions">
              <button type="button" className="sr-secondary" onClick={() => { setDone(null); setFile(null); setPreview(null); setFields(EMPTY); }}>
                Submit another
              </button>
              <button type="button" className="sr-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            <DemoDrop file={file} onFile={chooseFile} busy={sending} />
            {reading && <p className="sr-muted">Reading demo…</p>}
            {preview && <DemoSummary preview={preview} melMode={melMode} setMelMode={setMelMode} user={user} />}
            <label>
              <span>YouTube link (optional)</span>
              <input value={fields.youtube} onChange={(e) => set("youtube", e.target.value)} placeholder="https://youtu.be/…" />
            </label>
            <label>
              <span>Comment (optional)</span>
              <textarea value={fields.comment} onChange={(e) => set("comment", e.target.value)} maxLength={500} rows={2} />
            </label>
            {admin && <AdminFields fields={fields} set={set} />}
            {error && (
              <p className="sr-error" role="alert">
                {error}
              </p>
            )}
            <div className="sr-actions">
              <button type="button" className="sr-secondary" onClick={onClose} disabled={sending}>
                Cancel
              </button>
              <button type="submit" className="sr-primary" disabled={!canSubmit}>
                {sending ? "Submitting…" : "Submit"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
