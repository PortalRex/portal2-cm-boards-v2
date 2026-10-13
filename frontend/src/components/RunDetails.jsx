import { useState } from "react";
import { OutlineButton, PlayerLink } from "./ui";
import { DownloadIcon, YouTubeIcon, PlayIcon, VideocamIcon } from "./Icons";
import { RunVideo, runVideo } from "./RunMedia";
import { deleteRun, fetchSegments, removeRunDemo, setCoopHost, setRunBanned, setRunPartner } from "../api/client";
import { bumpDataVersion } from "../lib/dataVersion";
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
// score-update entry, map board entry or profile score (all share these fields).
export default function RunDetails({ run, map, game = "portal2", rendered }) {
  const segments = useSegments({ ...run, map });
  const video = runVideo(run, game, rendered);
  const rank = run.postRank ?? run.rank;

  return (
    <div className="run-details">
      <div className="score-details">
        <div className="sd-video">
          <RunVideo run={run} game={game} rendered={rendered} title={`${map.title} run`} />
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
            <dd>{run.note || "No comment"}</dd>
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
            {run.timestamp && (
              <>
                <dt>Date:</dt>
                <dd className="num">{formatDate(run.timestamp)}</dd>
              </>
            )}
            <dt>SAR Version:</dt>
            <dd>{run.sarVersion || "Unknown"}</dd>
            <dt>Status:</dt>
            <dd>{run.banned ? "Banned" : run.verified === false ? "Pending" : "Verified"}</dd>
          </dl>
          <AdminTools run={run} game={game} />
        <div className="sd-buttons">
            {/* Demo downloads aren't exposed to this frontend yet. */}
            <OutlineButton disabled title={run.demoId ? "Demo downloads are not available yet" : "No demo for this run"}>
              Download Demo <DownloadIcon />
            </OutlineButton>
            <OutlineButton
              as="a"
              href={run.youtubeId ? `https://www.youtube.com/watch?v=${run.youtubeId.split("?")[0]}` : undefined}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!run.youtubeId}
              className={run.youtubeId ? "" : "is-disabled"}
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
                href={run.demoId && video?.render ? video.render : undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!run.demoId || !video?.render}
                className={`sd-autorender${run.demoId && video?.render ? "" : " is-disabled"}`}
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
      {state.message && <span className="sd-admin-ok">{state.message}</span>}
      {state.error && <span className="sd-roles-error">{state.error}</span>}
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
