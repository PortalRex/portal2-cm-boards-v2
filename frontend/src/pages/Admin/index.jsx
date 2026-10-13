import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import { Panel, Select, Loading, EmptyState, PlayerLink, RankNumber } from "../../components/ui";
import { MoreIcon } from "../../components/Icons";
import { fetchAudit, setRunBanned, setRunWrHidden } from "../../api/client";
import { bumpDataVersion } from "../../lib/dataVersion";
import useCurrentUser, { isStaff } from "../../hooks/useCurrentUser";
import { formatDate, formatScore, timeAgo } from "../../lib/format";
import { getMap, mapPath } from "../../data/maps";
import background from "../../scenes/global/img/Background.png";
import "./Admin.css";

const ACTIONS = {
  "run.ban": "Hid from boards",
  "run.unban": "Restored",
  "run.delete": "Deleted",
  "demo.remove": "Removed demo",
  "coop.set_partner": "Set partner",
  "coop.set_host": "Set colors",
  "run.hide_wr": "Removed from WR history",
  "run.show_wr": "Back in WR history",
  "profile.freeze": "Froze profile",
  "profile.unfreeze": "Unfroze profile",
  "profile.set_role": "Changed role",
};
const TONES = {
  "run.ban": "warn",
  "run.unban": "ok",
  "run.delete": "bad",
  "demo.remove": "warn",
  "coop.set_partner": "info",
  "coop.set_host": "info",
  "run.hide_wr": "warn",
  "run.show_wr": "ok",
  "profile.freeze": "bad",
  "profile.unfreeze": "ok",
  "profile.set_role": "info",
};
const TABS = [
  { value: "runs", label: "Runs", actions: ["run.ban", "run.unban", "run.delete", "demo.remove", "run.hide_wr", "run.show_wr", "coop.set_partner", "coop.set_host"] },
  { value: "profiles", label: "Profiles", actions: ["profile.freeze", "profile.unfreeze", "profile.set_role"] },
];
const PAGE = 50;

// Admins only: a changelog of every change admins (or the board's services) have made.
export default function Admin() {
  const user = useCurrentUser();
  return (
    <Layout background={background} tint="mono">
      <Panel icon={MoreIcon} title="Admin changelog" bodyClassName="admin-body">
        {!user ? (
          <EmptyState>Sign in with an admin account to see the admin changelog.</EmptyState>
        ) : !isStaff(user) ? (
          <EmptyState>Staff only.</EmptyState>
        ) : (
          <AuditLog />
        )}
      </Panel>
    </Layout>
  );
}

function AuditLog() {
  const [kind, setKind] = useState("runs");
  const [action, setAction] = useState("");
  const [entries, setEntries] = useState([]);
  const [state, setState] = useState({ loading: true, done: false, error: null });
  const tab = TABS.find((t) => t.value === kind);
  const actionOptions = [{ value: "", label: "All actions" }, ...tab.actions.map((value) => ({ value, label: ACTIONS[value] }))];

  const load = async (before, replace) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const page = await fetchAudit({ limit: PAGE, before, kind, action: action || undefined });
      setEntries((prev) => (replace ? page : [...prev, ...page]));
      setState({ loading: false, done: page.length < PAGE, error: null });
    } catch (e) {
      setState({ loading: false, done: true, error: e.message });
    }
  };
  useEffect(() => {
    load(undefined, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, action]);

  return (
    <>
      <div className="admin-toolbar">
        <div className="segmented admin-tabs">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              className={kind === t.value ? "is-active" : ""}
              onClick={() => {
                setKind(t.value);
                setAction("");
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Select value={action} onChange={setAction} options={actionOptions} label="Action" className="admin-filter" />
      </div>
      {state.error && <EmptyState>Couldn’t load the admin changelog: {state.error}</EmptyState>}
      {!state.error && !state.loading && !entries.length && <EmptyState>No admin actions yet.</EmptyState>}
      {entries.length > 0 &&
        (kind === "runs" ? (
          <div className="audit-table" role="table">
            <div className="audit-row is-run audit-head" role="row">
              <span>Action</span>
              <span>Map</span>
              <span>Player(s)</span>
              <span className="end">Rank</span>
              <span className="end">Time</span>
              <span>Admin</span>
              <span>Reason</span>
              <span className="end">When</span>
            </div>
            {entries.map((e) => (
              <RunAuditRow key={e.id} entry={e} onChanged={() => load(undefined, true)} />
            ))}
          </div>
        ) : (
          <div className="audit-table" role="table">
            <div className="audit-row is-profile audit-head" role="row">
              <span>Action</span>
              <span>Profile</span>
              <span>Admin</span>
              <span>Reason</span>
              <span className="end">When</span>
            </div>
            {entries.map((e) => (
              <ProfileAuditRow key={e.id} entry={e} />
            ))}
          </div>
        ))}
      {state.loading && <Loading />}
      {!state.loading && !state.done && entries.length > 0 && (
        <button type="button" className="outline-button admin-more" onClick={() => load(entries[entries.length - 1].id, false)}>
          Load more
        </button>
      )}
    </>
  );
}

const Badge = ({ action }) => <span className={`audit-badge is-${TONES[action] || "info"}`}>{ACTIONS[action] || action}</span>;

const ActedBy = ({ entry }) => (entry.via_service ? <i className="muted">Board service</i> : <Link to={`/profile/${entry.admin_profile}`}>{entry.admin_name}</Link>);

const When = ({ entry }) => (
  <span className="audit-when end" title={formatDate(entry.created_at)}>
    {timeAgo(entry.created_at)}
    <small className="num">{formatDate(entry.created_at)}</small>
  </span>
);

function Reason({ entry, open, onToggle }) {
  const hasDetails = entry.details && entry.details !== "{}";
  return (
    <span className="audit-reason">
      {entry.reason || <span className="muted">—</span>}
      {hasDetails && (
        <button type="button" className="audit-details-toggle" onClick={onToggle} aria-expanded={open}>
          {open ? "Hide" : "Details"}
        </button>
      )}
    </span>
  );
}

const pretty = (details) => JSON.stringify(JSON.parse(details), null, 2);

const roleName = (r) => (r ? r[0].toUpperCase() + r.slice(1) : "none");
function roleChange(details) {
  try {
    const d = JSON.parse(details);
    return `${roleName(d.before)} → ${roleName(d.role)}`;
  } catch {
    return "";
  }
}

// Undo for "Hid from boards" / "Removed from WR history" while the run is still hidden.
// The restore is itself logged.
const UNDO = {
  "run.ban": { stillHidden: (e) => e.run_banned, restore: (e) => setRunBanned(e.target_id, false, `Undo of #${e.id}`) },
  "run.hide_wr": { stillHidden: (e) => e.run_wr_hidden, restore: (e) => setRunWrHidden(e.target_id, false, `Undo of #${e.id}`) },
};

function RestoreButton({ entry, onChanged }) {
  const [state, setState] = useState({ busy: false, error: null });
  const undo = UNDO[entry.action];
  if (!undo || !entry.run_exists) return null;
  if (!undo.stillHidden(entry)) return <span className="audit-restored">Undone</span>;
  const restore = async () => {
    setState({ busy: true, error: null });
    try {
      await undo.restore(entry);
      bumpDataVersion();
      onChanged();
    } catch (e) {
      setState({ busy: false, error: e.message });
    }
  };
  return (
    <button type="button" className="audit-restore" onClick={restore} disabled={state.busy} title={state.error || "Put this run back on the boards"}>
      {state.busy ? "Restoring…" : "Restore"}
    </button>
  );
}

function RunAuditRow({ entry, onChanged }) {
  const [open, setOpen] = useState(false);
  const map = entry.map_id ? getMap(entry.map_id, entry.game_id === 2 ? "mel" : "portal2") : null;
  const title = map?.title || entry.map_name || (entry.map_id ? `Map ${entry.map_id}` : `Run #${entry.target_id}`);
  return (
    <div className={`audit-entry${entry.run_exists ? "" : " is-gone"}`}>
      <div className="audit-row is-run" role="row">
        <span className="audit-action">
          <Badge action={entry.action} />
          <RestoreButton entry={entry} onChanged={onChanged} />
        </span>
        <span className="audit-map">
          {map && entry.run_exists ? <Link to={mapPath(map)}>{title}</Link> : <span className="audit-map-title">{title}</span>}
          <small className="muted">
            {map?.chapter || ""}
            {!entry.run_exists && " · run deleted"}
          </small>
        </span>
        <span className="audit-players">
          {entry.player && <PlayerLink player={{ profileNumber: entry.player, name: entry.player_name || entry.player }} />}
          {entry.partner && (
            <>
              {" & "}
              <PlayerLink player={{ profileNumber: entry.partner, name: entry.partner_name || entry.partner }} />
            </>
          )}
        </span>
        <span className="end num">
          <RankNumber rank={entry.post_rank} />
        </span>
        <span className="end num">{entry.score != null ? formatScore(entry.score) : "—"}</span>
        <span>
          <ActedBy entry={entry} />
        </span>
        <Reason entry={entry} open={open} onToggle={() => setOpen((o) => !o)} />
        <When entry={entry} />
      </div>
      {open && <pre className="audit-details">{pretty(entry.details)}</pre>}
    </div>
  );
}

function ProfileAuditRow({ entry }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="audit-entry">
      <div className="audit-row is-profile" role="row">
        <Badge action={entry.action} />
        <span>
          <Link to={`/profile/${entry.target_id}`}>{entry.target_id}</Link>
          {entry.action === "profile.set_role" && <small className="muted audit-role">{roleChange(entry.details)}</small>}
        </span>
        <span>
          <ActedBy entry={entry} />
        </span>
        <Reason entry={entry} open={open} onToggle={() => setOpen((o) => !o)} />
        <When entry={entry} />
      </div>
      {open && <pre className="audit-details">{pretty(entry.details)}</pre>}
    </div>
  );
}
