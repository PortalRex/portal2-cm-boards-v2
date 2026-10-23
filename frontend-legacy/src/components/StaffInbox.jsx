import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { InboxIcon } from "./Icons";
import { fetchStaffInbox, markStaffInboxSeen, waitStaffInbox } from "../api/client";
import { ACTIONS, TONES } from "../lib/adminActions";
import { useDataVersion } from "../lib/dataVersion";
import { formatDate, formatScore, timeAgo } from "../lib/format";
import { getMap, mapPath } from "../data/maps";
import useCurrentUser from "../hooks/useCurrentUser";
import "./StaffInbox.css";

// New staff actions arrive live (waitStaffInbox); the inbox is also loaded again on this
// interval in case the live connection misses something.
const POLL = 5 * 60 * 1000;

const parse = (details) => {
  try {
    return typeof details === "string" ? JSON.parse(details) : details || {};
  } catch {
    return {};
  }
};

const REPORTS = "/admin?section=reports";

// What an entry is about, and where it links: the run's map (a new report: the reports list),
// the profile, or the admin log.
function describe(entry) {
  if (entry.run_id || entry.map_id) {
    const map = entry.map_id ? getMap(entry.map_id, entry.game_id === 2 ? "mel" : "portal2") : null;
    const players = [entry.player_name || entry.player, entry.partner_name].filter(Boolean).join(" & ");
    const score = entry.score != null ? formatScore(entry.score) : null;
    return {
      title: map?.title || entry.map_name || `Run #${entry.target_id}`,
      sub: [players, score].filter(Boolean).join(" · "),
      note: entry.action === "report.new" ? entry.reason : null,
      to: entry.action === "report.new" ? REPORTS : map && entry.run_exists ? mapPath(map) : "/admin",
    };
  }
  if (entry.target_type === "profile") return { title: entry.target_name || entry.target_id, sub: null, to: `/profile/${entry.target_id}` };
  const name = parse(entry.details).name;
  return { title: name ? `${entry.target_type} ${name}` : `${entry.target_type} ${entry.target_id}`, sub: null, to: "/admin" };
}

// Staff only: an inbox next to the avatar with a badge counting staff actions (the audit log)
// made since you last opened it, not counting your own. Opening it marks them read. Updates live.
export default function StaffInbox() {
  const user = useCurrentUser();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  // Entries newer than this are highlighted while the inbox is open.
  const [highlightAfter, setHighlightAfter] = useState(null);
  const box = useRef(null);
  const { pathname } = useLocation();
  const version = useDataVersion();

  const load = useCallback(() => fetchStaffInbox().then(setData, () => {}), []);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL);
    return () => clearInterval(timer);
  }, [load, version]);

  // Live: wait for the next entry (or the inbox being read in another tab), load, repeat.
  const newestId = data?.items?.[0]?.id ?? null;
  const seenId = data?.seen_id ?? null;
  const loaded = data != null;
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!loaded) return undefined;
    const abort = new AbortController();
    let retry = null;
    const again = () => !abort.signal.aborted && setRound((r) => r + 1);
    waitStaffInbox(newestId, seenId, abort.signal).then(
      (changed) => (changed ? load().then(again) : again()),
      () => {
        // Server restarting or offline: try again shortly.
        if (!abort.signal.aborted) retry = setTimeout(again, 10000);
      },
    );
    return () => {
      abort.abort();
      clearTimeout(retry);
    };
  }, [loaded, newestId, seenId, round, load]);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === "keydown" ? e.key === "Escape" : !box.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const toggle = () => {
    if (open) return setOpen(false);
    setOpen(true);
    const newest = data?.items?.[0]?.id;
    setHighlightAfter(data?.unread ? data.seen_id ?? 0 : null);
    if (newest && data.unread) {
      // The badge clears now; seen_id follows once the server has it (the wait then reloads).
      setData((d) => ({ ...d, unread: 0 }));
      markStaffInboxSeen(newest).catch(() => {});
    }
  };

  const unread = data?.unread || 0;
  const openReports = data?.open_reports || 0;
  const items = data?.items || [];
  return (
    <div className="staff-inbox" ref={box}>
      <button
        type="button"
        className={`staff-inbox-button${open ? " is-open" : ""}`}
        onClick={toggle}
        aria-expanded={open}
        aria-label={`Staff inbox${unread ? `, ${unread} new` : ""}${openReports ? `, ${openReports} open report${openReports === 1 ? "" : "s"}` : ""}`}
        title={openReports ? `Staff inbox · ${openReports} open report${openReports === 1 ? "" : "s"}` : "Staff inbox"}
      >
        <InboxIcon />
        {unread > 0 && <span className="staff-inbox-badge">{unread > 99 ? "99+" : unread}</span>}
        {openReports > 0 && <span className="staff-inbox-reports">{openReports > 99 ? "99+" : openReports}</span>}
      </button>
      {open && (
        <div className="staff-inbox-panel" role="dialog" aria-label="Staff inbox">
          <div className="staff-inbox-head">
            <strong>Staff actions</strong>
            <Link to="/admin">Admin log</Link>
          </div>
          {openReports > 0 && (
            <Link to={REPORTS} className="staff-inbox-open-reports">
              <span className="staff-inbox-reports is-inline">{openReports}</span>
              open report{openReports === 1 ? "" : "s"} to review
            </Link>
          )}
          {!items.length ? (
            <p className="staff-inbox-empty">Nothing yet.</p>
          ) : (
            <ul className="staff-inbox-list">
              {items.map((e) => {
                const what = describe(e);
                const isNew = highlightAfter != null && e.id > highlightAfter && e.admin_profile !== user?.profileNumber;
                return (
                  <li key={e.id} className={isNew ? "is-new" : ""}>
                    <Link to={what.to} className="staff-inbox-item">
                      <span className={`staff-inbox-dot is-${TONES[e.action] || "info"}`} aria-hidden="true" />
                      <span className="staff-inbox-text">
                        <span className="staff-inbox-line">
                          <b>{ACTIONS[e.action] || e.action}</b> {what.title}
                        </span>
                        {what.sub && <span className="staff-inbox-sub">{what.sub}</span>}
                        {what.note && <span className="staff-inbox-note">“{what.note}”</span>}
                        <span className="staff-inbox-meta" title={formatDate(e.created_at)}>
                          {e.action === "report.new" ? "Player report" : e.via_service ? "Board service" : e.admin_name} · {timeAgo(e.created_at)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
