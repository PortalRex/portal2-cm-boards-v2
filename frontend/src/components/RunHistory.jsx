import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchChangelog } from "../api/client";
import useApi from "../hooks/useApi";
import { mapPath } from "../data/maps";
import { formatDate, formatDateTime, formatDelta, formatScore, parseTimestamp } from "../lib/format";
import { CloseIcon } from "./Icons";
import { Avatar, EmptyState, Loading, RankNumber } from "./ui";
import { AutorenderLink, CommentButton, DemoLink, YouTubeLink } from "./RunMedia";
import "./RunHistory.css";

// A run's time as a button: clicking it (without opening the row) shows that player's history on
// the map, like the old boards' changelog for a player and chamber. Co-op runs get a tab per player.
export function TimeButton({ score, players, map, className = "" }) {
  const [open, setOpen] = useState(false);
  const people = (players || []).filter((p) => p?.profileNumber);
  if (!people.length || !map) return <span className={className}>{formatScore(score)}</span>;
  return (
    <>
      <button
        type="button"
        className={`time-btn num ${className}`}
        title={`${people.map((p) => p.name).join(" & ")}'s history on ${map.title}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {formatScore(score)}
      </button>
      {open && createPortal(<RunHistoryDialog players={people} map={map} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function RunHistoryDialog({ players, map, onClose }) {
  const [who, setWho] = useState(players[0].profileNumber);
  const player = players.find((p) => p.profileNumber === who) || players[0];
  const runs = useApi(
    () => fetchChangelog({ profileNumber: player.profileNumber, mapId: map.id, game: map.game, banned: "show", limit: 500 }),
    [player.profileNumber, map.id],
  );
  useEffect(() => {
    const key = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  const rows = runs.data || [];

  return (
    <div className="rh-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onClick={(e) => e.stopPropagation()}>
      <div className="rh-dialog" role="dialog" aria-modal="true" aria-labelledby="rh-title">
        <header className="rh-head">
          <Avatar src={player.avatar} name={player.name} size={36} />
          <h2 id="rh-title">
            <Link to={`/profile/${player.profileNumber}`} onClick={onClose}>
              {player.name}
            </Link>
            <span className="muted"> on </span>
            <Link to={mapPath(map)} onClick={onClose}>
              {map.title}
            </Link>
          </h2>
          <button type="button" className="rh-close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>
        {players.length > 1 && (
          <div className="segmented rh-tabs">
            {players.map((p) => (
              <button key={p.profileNumber} type="button" className={p.profileNumber === player.profileNumber ? "is-active" : ""} onClick={() => setWho(p.profileNumber)}>
                {p.name}
              </button>
            ))}
          </div>
        )}
        {runs.loading && !runs.data ? (
          <Loading />
        ) : !rows.length ? (
          <EmptyState>No runs on record.</EmptyState>
        ) : (
          <>
            <HistoryChart rows={rows} />
            <div className="rh-table" role="table">
              <div className="rh-row rh-row-head" role="row">
                <span>Date</span>
                <span className="end">Rank</span>
                <span className="end">Time</span>
                <span className="end">Improvement</span>
                <span />
              </div>
              {rows.map((r) => (
                <div key={r.id} className={`rh-row${r.banned ? " is-banned" : ""}`} role="row">
                  <span className="muted" title={formatDateTime(r.timestamp)}>
                    {r.timestamp ? formatDate(r.timestamp) : "Unknown date"}
                    {r.banned ? <span className="badge-banned rh-badge">Banned</span> : !r.verified && <span className="badge-pending rh-badge">Pending</span>}
                  </span>
                  <span className="end num">
                    <RankNumber rank={r.preRank} colored /> → <RankNumber rank={r.postRank} colored />
                  </span>
                  <strong className="end num">{formatScore(r.score)}</strong>
                  <span className="end num muted">{r.scoreDelta != null ? formatDelta(r.scoreDelta, "s") : ""}</span>
                  <span className="rh-icons">
                    <CommentButton note={r.note} />
                    <AutorenderLink run={r} game={map.game} size={20} />
                    <YouTubeLink id={r.youtubeId} size={22} />
                    <DemoLink demoId={r.demoId} size={20} />
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// The player's time on the map over time (dated, unbanned runs), as a step line.
function HistoryChart({ rows }) {
  const data = useMemo(
    () =>
      rows
        .filter((r) => r.timestamp && !r.banned)
        .map((r) => ({ t: parseTimestamp(r.timestamp).getTime(), score: r.score }))
        .sort((a, b) => a.t - b.t),
    [rows],
  );
  if (data.length < 2) return null;
  const min = Math.min(...data.map((d) => d.score));
  const max = Math.max(...data.map((d) => d.score));
  const pad = Math.max(1, Math.round((max - min) * 0.1));
  return (
    <div className="rh-chart">
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={[...data, { ...data[data.length - 1], t: Date.now() }]} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="rhFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4ea2ff" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#4ea2ff" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(t) => new Date(t).getFullYear()} tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={40} />
          <YAxis domain={[min - pad, max + pad]} ticks={min === max ? [min] : [min, max]} tickFormatter={formatScore} tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={56} allowDataOverflow />
          <Tooltip
            isAnimationActive={false}
            contentStyle={{ background: "var(--menu)", border: "1px solid var(--border)", borderRadius: 4 }}
            labelFormatter={(t) => formatDate(t)}
            formatter={(v) => [formatScore(v), "Time"]}
          />
          <Area type="stepAfter" dataKey="score" stroke="#4ea2ff" strokeWidth={2} fill="url(#rhFill)" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
