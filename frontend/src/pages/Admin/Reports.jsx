import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, Loading, PlayerLink, RankNumber } from "../../components/ui";
import { REPORT_REASONS, fetchReports, setReportStatus } from "../../api/client";
import { findMap, mapPath } from "../../data/maps";
import { formatDate, formatScore, timeAgo } from "../../lib/format";
import { bumpDataVersion } from "../../lib/dataVersion";
import "./Reports.css";

const STATUSES = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
];
const REASON_LABELS = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label]));
const PAGE = 50;

// Staff: anonymous run reports. Resolve (after acting on the run) or dismiss them.
export default function Reports({ onCountChange }) {
  const [status, setStatus] = useState("open");
  const [reports, setReports] = useState([]);
  const [state, setState] = useState({ loading: true, done: false, error: null });

  const load = async (before, replace) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const page = await fetchReports(status, before);
      setReports((prev) => (replace ? page : [...prev, ...page]));
      setState({ loading: false, done: page.length < PAGE, error: null });
    } catch (e) {
      setState({ loading: false, done: true, error: e.message });
    }
  };
  useEffect(() => {
    load(undefined, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div className="rp">
      <div className="segmented rp-tabs">
        {STATUSES.map((s) => (
          <button key={s.value} type="button" className={status === s.value ? "is-active" : ""} onClick={() => setStatus(s.value)}>
            {s.label}
          </button>
        ))}
      </div>
      <p className="rp-hint">Reports are anonymous. Open the run to hide it, mark it pending or fix its details, then resolve the report.</p>
      {state.error && <EmptyState>Couldn’t load reports: {state.error}</EmptyState>}
      {!state.error && !state.loading && !reports.length && <EmptyState>{status === "open" ? "No open reports." : "No reports."}</EmptyState>}
      {reports.map((r) => (
        <ReportCard
          key={r.id}
          report={r}
          onChanged={() => {
            load(undefined, true);
            onCountChange?.();
          }}
        />
      ))}
      {state.loading && <Loading />}
      {!state.loading && !state.done && reports.length > 0 && (
        <button type="button" className="outline-button admin-more" onClick={() => load(reports[reports.length - 1].id, false)}>
          Load more
        </button>
      )}
    </div>
  );
}

function ReportCard({ report: r, onChanged }) {
  const [note, setNote] = useState("");
  const [all, setAll] = useState(r.open_on_run > 1);
  const [state, setState] = useState({ busy: false, error: null });
  const map = findMap(r.map_id);
  const act = async (status) => {
    setState({ busy: true, error: null });
    try {
      await setReportStatus(r.id, status, note.trim(), all);
      bumpDataVersion();
      onChanged();
    } catch (e) {
      setState({ busy: false, error: e.message });
    }
  };
  const player = { profileNumber: r.profile_number, name: r.user_name, avatar: r.avatar };
  const partner = r.partner ? { profileNumber: r.partner, name: r.partner_name || r.partner } : null;
  return (
    <article className={`rp-card is-${r.status}`}>
      <header className="rp-head">
        <span className={`rp-reason is-${r.reason}`}>{REASON_LABELS[r.reason] || r.reason}</span>
        {r.open_on_run > 1 && r.status === "open" && <span className="rp-count">{r.open_on_run} open reports on this run</span>}
        <span className="rp-when" title={formatDate(`${r.created_at}Z`)}>
          {timeAgo(`${r.created_at}Z`)}
        </span>
      </header>
      <div className="rp-run">
        <span className="rp-map">{map ? <Link to={mapPath(map)}>{r.map_name}</Link> : r.map_name}</span>
        <span className="rp-players">
          <PlayerLink player={player} />
          {partner && (
            <>
              <span className="muted"> & </span>
              <PlayerLink player={partner} />
            </>
          )}
        </span>
        <span className="num rp-time">{formatScore(r.score)}</span>
        <span className="rp-rank">
          <RankNumber rank={r.post_rank} />
        </span>
        <span className="rp-flags">
          {r.run_banned && <span className="badge-banned">Hidden</span>}
          {r.run_verified === false && <span className="badge-pending">Pending</span>}
          <span className="muted">{r.has_demo ? "Demo" : "No demo"}</span>
          {r.youtube_id && (
            <a href={`https://www.youtube.com/watch?v=${r.youtube_id.split("?")[0]}`} target="_blank" rel="noreferrer">
              Video
            </a>
          )}
        </span>
      </div>
      {r.details && <p className="rp-details">{r.details}</p>}
      {r.status === "open" ? (
        <div className="rp-actions">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (audit log)" maxLength={500} />
          {r.open_on_run > 1 && (
            <label className="rp-all">
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> All {r.open_on_run} on this run
            </label>
          )}
          <button type="button" disabled={state.busy} onClick={() => act("dismissed")}>
            Dismiss
          </button>
          <button type="button" className="is-primary" disabled={state.busy} onClick={() => act("resolved")}>
            Resolve
          </button>
        </div>
      ) : (
        <div className="rp-actions">
          <span className="muted">
            {r.status === "resolved" ? "Resolved" : "Dismissed"}
            {r.resolved_by_name ? ` by ${r.resolved_by_name}` : ""}
            {r.resolved_at ? ` ${timeAgo(`${r.resolved_at}Z`)}` : ""}
            {r.resolution_note ? ` · “${r.resolution_note}”` : ""}
          </span>
          <button type="button" disabled={state.busy} onClick={() => act("open")}>
            Reopen
          </button>
        </div>
      )}
      {state.error && <p className="rp-error">{state.error}</p>}
    </article>
  );
}
