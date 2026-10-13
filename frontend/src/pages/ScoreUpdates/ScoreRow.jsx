import { useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, PlayerLink, RankChange } from "../../components/ui";
import { TriangleDown } from "../../components/Icons";
import RunDetails from "../../components/RunDetails";
import { toggleOnRowClick } from "../../lib/rows";
import { mapPath } from "../../data/maps";
import { coopRoles, tintFor, useRoleOverrides } from "../../lib/coopRoles";
import { formatScore, formatDelta, timeAgo, formatDate } from "../../lib/format";


export default function ScoreRow({ entry, rendered }) {
  const [open, setOpen] = useState(false);
  const { players, rolesKnown } = coopRoles(entry, useRoleOverrides());
  const coop = players.length > 1;
  const pending = !entry.verified;

  return (
    <div className={`score-row${open ? " is-open" : ""}${coop ? " is-coop" : ""}${entry.banned ? " is-banned" : ""}`}>
      <div className="score-row-main" onClick={toggleOnRowClick(() => setOpen((o) => !o))}>
        <div className="sr-rank">
          <RankChange pre={entry.preRank} post={entry.postRank} />
        </div>

        <Link to={mapPath(entry.map)} className="sr-map" style={entry.map.image ? { "--map-image": `url("${entry.map.image}")` } : undefined}>
          <span className="sr-map-name">{entry.map.title}</span>
          <span className="sr-map-chapter">{entry.map.chapter}</span>
          <span className="sr-map-ago green">{timeAgo(entry.timestamp)}</span>
        </Link>

        <div className="sr-players">
          {players.map((p, i) => (
            <div key={i} className={`sr-player ${coop ? tintFor(rolesKnown, i) : ""}`} title={coop && !rolesKnown ? "Unknown which player was blue" : undefined}>
              <Avatar src={p.avatar} name={p.name} size={46} />
              <PlayerLink player={p} className="sr-player-name" />
            </div>
          ))}
        </div>

        <div className="sr-time num">
          {formatScore(entry.score)}
          {entry.scoreDelta != null && <span className="sr-time-delta"> ({formatDelta(entry.scoreDelta, "s")})</span>}
        </div>
        <div className="sr-delta num">{entry.scoreDelta != null ? formatDelta(entry.scoreDelta, "s") : ""}</div>
        <div className="sr-points num">{entry.pointsDelta != null ? `${entry.pointsDelta > 0 ? "+" : ""}${entry.pointsDelta}` : ""}</div>
        <div className="sr-date">
          <span className="green">{timeAgo(entry.timestamp)}</span>
          <span className="sr-date-day num">{formatDate(entry.timestamp)}</span>
        </div>
        <div className="sr-status">
          {entry.banned ? <span className="badge-banned">Banned</span> : pending && <span className="badge-pending">Pending</span>}
        </div>
        <button type="button" className="sr-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? "Hide details" : "Show details"}>
          <TriangleDown size={14} />
        </button>
      </div>

      {open && <RunDetails run={entry} map={entry.map} game={entry.game || "portal2"} rendered={rendered} />}
    </div>
  );
}
