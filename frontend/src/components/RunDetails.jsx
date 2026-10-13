import { useState } from "react";
import { OutlineButton, PlayerLink } from "./ui";
import { DownloadIcon, YouTubeIcon, PlayIcon, VideocamIcon, ThumbUpIcon, ThumbUpOutlineIcon, ThumbDownIcon, ThumbDownOutlineIcon } from "./Icons";
import { RunVideo, runVideo } from "./RunMedia";
import { addRunDemo, deleteRun, fetchCoopHalves, fetchReactionRecord, fetchReactions, fetchSegments, removeRunDemo, setCoopHost, setReaction, setRunBanned, setRunPartner, setRunVerified } from "../api/client";
import { bumpDataVersion, useDataVersion } from "../lib/dataVersion";
import useApi from "../hooks/useApi";
import useCurrentUser, { isStaff } from "../hooks/useCurrentUser";
import { coopRoles, setRoleOverride, useRoleOverrides } from "../lib/coopRoles";
import { formatDate, formatScore } from "../lib/format";
import "./RunDetails.css";

// Segment table built from the demo's SAR mtriggers (read by autorender, stored with
// the run). Loaded when the details open.
function useSegments(run) {
  return useApi(() => fetchSegments(run).catch(() => null), [run.id ?? run.changelogId]);
}

// Expanded view of one run: video, mtrigger segments, and run info / links. `run` is a
// score-update entry, map board entry or profile score (all share these fields). Co-op runs
// get a toggle between the two players' halves (each has its own demo, video and comment).
export default function RunDetails({ run, map, game = "portal2", rendered, showReactions = true }) {
  const version = useDataVersion();
  const halves = useApi(() => (run.coopId != null ? fetchCoopHalves(run.coopId).catch(() => null) : Promise.resolve(null)), [run.coopId, version]);
  const [picked, setPicked] = useState(null);
  const own = run.changelogId ?? run.id;
  const list = halves.data?.length === 2 ? halves.data : null;
  const index = picked ?? (list ? Math.max(0, list.findIndex((h) => h.changelogId === own)) : 0);
  const half = list?.[index];
  // What the media and comment show: the selected player's own entry.
  const view =
    half?.changelogId != null
      ? {
          ...run,
          id: half.changelogId,
          changelogId: half.changelogId,
          changelogIds: [half.changelogId],
          youtubeId: half.youtubeId,
          autorenderId: half.autorenderId,
          demoId: half.demoId,
          note: half.note,
          timestamp: half.timestamp ?? run.timestamp,
        }
      : run;
  const segments = useSegments({ ...view, map });
  const video = runVideo(view, game, rendered);
  const rank = run.postRank ?? run.rank;

  return (
    <div className="run-details">
      <div className="score-details">
        <div className="sd-video">
          <RunVideo key={view.changelogId ?? view.id} run={view} game={game} rendered={rendered} title={`${map.title} run`} />
          {list && <CoopToggle halves={list} index={index} onPick={setPicked} />}
        </div>

        <div className="sd-segments">
          {segments.loading ? (
            <div className="sd-empty">Loading segments…</div>
          ) : segments.data?.length ? (
            <table>
              <thead>
                <tr>
                  <th>Segment</th>
                  <th>Seconds</th>
                  <th>Ticks</th>
                  <th>Total</th>
                  <th>Total ticks</th>
                </tr>
              </thead>
              <tbody>
                {segments.data.map((s, i) => (
                  <tr key={i} title={s.splits.length ? s.splits.map((sp) => `${sp.name}: ${sp.ticks}`).join("\n") : undefined}>
                    <td>{s.name}</td>
                    <td className="num">{s.seconds.toFixed(3)}</td>
                    <td className="num">{s.ticks}</td>
                    <td className="num">{s.total.toFixed(3)}</td>
                    <td className="num">{s.totalTicks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="sd-empty">
              No mtrigger data for this run. Segments are read from the demo when autorender renders it, and only demos recorded with SAR mtriggers have them.
            </div>
          )}
        </div>

        <div className="sd-info">
          <dl>
            <dt>Comment:</dt>
            <dd>{view.note || "No comment"}</dd>
          </dl>
          <dl className="sd-meta">
            {run.players?.length > 0 && (
              <>
                <dt>Player{run.players.length > 1 ? "s" : ""}:</dt>
                <dd className="sd-players">
                  {run.players.map((p, i) => (
                    <PlayerLink key={i} player={p} />
                  ))}
                </dd>
              </>
            )}
            {run.score != null && (
              <>
                <dt>Time:</dt>
                <dd className="num">
                  {formatScore(run.score)}
                  {rank != null ? ` · rank ${rank}` : ""}
                </dd>
              </>
            )}
            {view.timestamp && (
              <>
                <dt>Date:</dt>
                <dd className="num">{formatDate(view.timestamp)}</dd>
              </>
            )}
            <dt>SAR Version:</dt>
            <dd>{run.sarVersion || "Unknown"}</dd>
            <dt>Status:</dt>
            <dd>{run.banned ? "Banned" : run.verified === false ? "Pending" : "Verified"}</dd>
          </dl>
          <PendingProof run={run} />
          {showReactions && <ReactionsBar changelogId={own} />}
          <AdminTools run={run} game={game} />
          <div className="sd-buttons">
            {/* Demo downloads aren't exposed to this frontend yet. */}
            <OutlineButton disabled title={view.demoId ? "Demo downloads are not available yet" : "No demo for this run"}>
              Download Demo <DownloadIcon />
            </OutlineButton>
            <OutlineButton
              as="a"
              href={view.youtubeId ? `https://www.youtube.com/watch?v=${view.youtubeId.split("?")[0]}` : undefined}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!view.youtubeId}
              className={view.youtubeId ? "" : "is-disabled"}
            >
              YouTube <YouTubeIcon />
            </OutlineButton>
            {video?.ready ? (
              <OutlineButton as="a" href={video.page || video.src} target="_blank" rel="noreferrer" className="sd-autorender">
                Autorender <PlayIcon />
              </OutlineButton>
            ) : (
              <OutlineButton
                as="a"
                href={view.demoId && video?.render ? video.render : undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!view.demoId || !video?.render}
                className={`sd-autorender${view.demoId && video?.render ? "" : " is-disabled"}`}
              >
                Request render <VideocamIcon />
              </OutlineButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Switch the panel between the two players' halves of a co-op run (blue first when known).
function CoopToggle({ halves, index, onPick }) {
  const rolesKnown = halves[0].isHost != null;
  return (
    <div className="sd-coop-toggle" role="tablist" aria-label="Player">
      {halves.map((h, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={i === index}
          className={`${i === index ? "is-active" : ""} ${rolesKnown ? (i === 0 ? "is-blue" : "is-orange") : "is-neutral"}`}
          disabled={h.changelogId == null}
          title={h.changelogId == null ? `${h.player?.name || "Partner"} has no run of their own recorded` : `Show ${h.player?.name || "this player"}'s demo, video and comment`}
          onClick={() => onPick(i)}
        >
          {h.player?.name || "Unknown partner"}
        </button>
      ))}
    </div>
  );
}

// Thumbs up / down. Anyone sees the counts; signed-in players can react (click again to clear).
function ReactionsBar({ changelogId }) {
  const user = useCurrentUser();
  const signedIn = Boolean(user) && !user.sample;
  const loaded = useApi(() => (changelogId != null ? fetchReactions(changelogId).catch(() => null) : Promise.resolve(null)), [changelogId, user?.profileNumber]);
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState(null);
  const r = counts || loaded.data;
  if (!r) return null;
  const react = async (value) => {
    setError(null);
    try {
      const mine = value === "up" ? 1 : -1;
      setCounts(await setReaction(changelogId, r.mine === mine ? null : value));
    } catch (e) {
      setError(e.message);
    }
  };
  const hint = signedIn ? undefined : "Sign in to react";
  return (
    <div className="sd-reactions">
      <button type="button" className={r.mine === 1 ? "is-mine" : ""} onClick={() => react("up")} disabled={!signedIn} title={hint || "Thumbs up"} aria-pressed={r.mine === 1}>
        {r.mine === 1 ? <ThumbUpIcon /> : <ThumbUpOutlineIcon />}
        <span className="num">{r.up}</span>
      </button>
      <button type="button" className={r.mine === -1 ? "is-mine is-down" : ""} onClick={() => react("down")} disabled={!signedIn} title={hint || "Thumbs down"} aria-pressed={r.mine === -1}>
        {r.mine === -1 ? <ThumbDownIcon /> : <ThumbDownOutlineIcon />}
        <span className="num">{r.down}</span>
      </button>
      {error && <span className="sd-roles-error">{error}</span>}
    </div>
  );
}

// Admin tools for a run (admins only). Every action is recorded in the audit log, with the
// optional reason. Co-op runs are acted on as a whole (both players' entries).
function AdminTools({ run, game }) {
  const user = useCurrentUser();
  const [reason, setReason] = useState("");
  const [partner, setPartner] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [state, setState] = useState({ busy: false, message: null, error: null });
  const changelogId = run.changelogId ?? run.id;
  if (!isStaff(user) || changelogId == null) return null;
  const coop = run.coopId != null || (run.players?.length ?? 0) > 1 || run.map?.mode === "coop";

  const act = async (label, fn) => {
    setState({ busy: true, message: null, error: null });
    try {
      await fn();
      setState({ busy: false, message: label, error: null });
      setConfirmDelete(false);
      bumpDataVersion();
    } catch (e) {
      setState({ busy: false, message: null, error: e.message });
    }
  };
  const why = reason.trim() || undefined;

  return (
    <div className="sd-admin">
      <div className="sd-admin-head">Admin</div>
      {coop && <RolesEditor run={run} />}
      <input className="sd-admin-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (saved in the audit log)" maxLength={500} />
      <div className="sd-admin-actions">
        {run.banned ? (
          <button type="button" disabled={state.busy} onClick={() => act("Run restored.", () => setRunBanned(changelogId, false, why))}>
            Restore to boards
          </button>
        ) : (
          <button type="button" disabled={state.busy} onClick={() => act("Run hidden from the boards.", () => setRunBanned(changelogId, true, why))}>
            Hide from boards
          </button>
        )}
        {!run.banned &&
          (run.verified === false ? (
            <button type="button" disabled={state.busy} onClick={() => act("Run verified.", () => setRunVerified(changelogId, true, why))}>
              Verify run
            </button>
          ) : (
            <button type="button" disabled={state.busy} onClick={() => act("Run marked pending.", () => setRunVerified(changelogId, false, why))}>
              Mark pending
            </button>
          ))}
        {run.demoId && (
          <button type="button" disabled={state.busy} onClick={() => act("Demo removed.", () => removeRunDemo(changelogId, why))}>
            Remove demo
          </button>
        )}
        <button
          type="button"
          className="is-danger"
          disabled={state.busy}
          onClick={() => (confirmDelete ? act("Run deleted.", () => deleteRun(changelogId, why)) : setConfirmDelete(true))}
          onBlur={() => setConfirmDelete(false)}
        >
          {confirmDelete ? "Click again to delete permanently" : "Delete run"}
        </button>
      </div>
      {coop && game === "portal2" && (
        <form
          className="sd-admin-partner"
          onSubmit={(e) => {
            e.preventDefault();
            if (partner.trim()) act("Partner set.", () => setRunPartner(changelogId, partner.trim(), why));
          }}
        >
          <input className="sd-admin-input" value={partner} onChange={(e) => setPartner(e.target.value)} placeholder="Partner SteamID64 (7656119…)" inputMode="numeric" />
          <button type="submit" disabled={state.busy || !partner.trim()}>
            Set partner
          </button>
        </form>
      )}
      <WhoReacted changelogId={changelogId} />
      {state.message && <span className="sd-admin-ok">{state.message}</span>}
      {state.error && <span className="sd-roles-error">{state.error}</span>}
    </div>
  );
}

// A pending run without a demo: its player (or co-op partner), or staff, can add the demo.
// The server checks the map, the exact time and the player, then verifies the run.
function PendingProof({ run }) {
  const user = useCurrentUser();
  const [state, setState] = useState({ busy: false, done: false, error: null });
  const changelogId = run.changelogId ?? run.id;
  if (!user || user.sample || run.verified !== false || run.banned || run.demoId || changelogId == null) return null;
  const mine = (run.players || []).some((p) => p.profileNumber === user.profileNumber);
  if (!mine && !isStaff(user)) return null;
  const upload = async (file) => {
    setState({ busy: true, done: false, error: null });
    try {
      await addRunDemo(changelogId, file);
      setState({ busy: false, done: true, error: null });
      bumpDataVersion();
    } catch (e) {
      setState({ busy: false, done: false, error: e.message });
    }
  };
  return (
    <div className="sd-pending">
      <span>{state.done ? "Demo added. The run is verified." : "This run is pending until its demo is added."}</span>
      {!state.done && (
        <label className={`sd-pending-upload${state.busy ? " is-busy" : ""}`}>
          {state.busy ? "Checking demo…" : "Add demo"}
          <input
            type="file"
            accept=".dem"
            hidden
            disabled={state.busy}
            onChange={(e) => {
              if (e.target.files?.[0]) upload(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </label>
      )}
      {state.error && <span className="sd-roles-error">{state.error}</span>}
    </div>
  );
}

// Staff: who reacted to the run, and every change (including changed and cleared reactions).
function WhoReacted({ changelogId }) {
  const [open, setOpen] = useState(false);
  const record = useApi(() => (open ? fetchReactionRecord(changelogId).catch(() => null) : Promise.resolve(null)), [open, changelogId]);
  const label = (r) => (r === 1 ? "👍" : r === -1 ? "👎" : "cleared");
  return (
    <div className="sd-who">
      <button type="button" className="sd-who-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? "Hide reactions" : "Who reacted"}
      </button>
      {open &&
        (record.loading ? (
          <span className="muted">Loading…</span>
        ) : !record.data ? (
          <span className="sd-roles-error">Couldn’t load reactions.</span>
        ) : (
          <>
            {record.data.current.length ? (
              <ul className="sd-who-list">
                {record.data.current.map((e) => (
                  <li key={e.profile_number}>
                    <span>{label(e.reaction)}</span>
                    <PlayerLink player={{ profileNumber: e.profile_number, name: e.user_name }} />
                    <span className="muted num">{formatDate(e.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="muted">No reactions yet.</span>
            )}
            {record.data.history.length > 0 && (
              <details className="sd-who-history">
                <summary>History ({record.data.history.length})</summary>
                <ul className="sd-who-list">
                  {record.data.history.map((e, i) => (
                    <li key={i}>
                      <span className="muted num">{formatDate(e.created_at)}</span>
                      <PlayerLink player={{ profileNumber: e.profile_number, name: e.user_name }} />
                      <span>{label(e.reaction)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        ))}
    </div>
  );
}

// Set which co-op player was blue (the host), or mark it unknown.
function RolesEditor({ run }) {
  const user = useCurrentUser();
  const { players, rolesKnown } = coopRoles(run, useRoleOverrides());
  const [state, setState] = useState({ saving: false, error: null });
  if (!isStaff(user) || run.coopId == null || players.length !== 2 || players.some((p) => !p.profileNumber)) return null;

  const current = rolesKnown ? players[0].profileNumber : null;
  const save = async (host) => {
    setState({ saving: true, error: null });
    try {
      await setCoopHost(run.coopId, host);
      setRoleOverride(run.coopId, host);
      setState({ saving: false, error: null });
    } catch (e) {
      setState({ saving: false, error: e.message });
    }
  };
  return (
    <div className="sd-roles">
      <span className="sd-roles-label">Blue (host):</span>
      <div className="segmented sd-roles-options">
        {players.map((p) => (
          <button key={p.profileNumber} type="button" className={current === p.profileNumber ? "is-active" : ""} disabled={state.saving} onClick={() => save(p.profileNumber)}>
            {p.name}
          </button>
        ))}
        <button type="button" className={current == null ? "is-active" : ""} disabled={state.saving} onClick={() => save(null)}>
          Unknown
        </button>
      </div>
      {state.error && <span className="sd-roles-error">{state.error}</span>}
    </div>
  );
}
