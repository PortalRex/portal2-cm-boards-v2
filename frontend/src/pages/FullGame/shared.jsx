import { Link } from "react-router-dom";
import { Avatar } from "../../components/ui";
import { CommentIcon, YouTubeIcon, DownloadIcon, PlayIcon } from "../../components/Icons";
import chamberImages from "../../scenes/global/ChamberImages";

// Banner per category, as on fullgame-boards: Finale 4 for solo, Gel Maze for co-op.
export const bannerImage = (category) => chamberImages[category?.players > 1 ? "52759" : "47456"];

export const boardPath = (game, category, level, query) => {
  const base = `/fullgame/${game}/${category}${level ? `/${level}` : ""}`;
  const qs = new URLSearchParams(Object.entries(query || {}).filter(([, v]) => v != null && v !== "")).toString();
  return qs ? `${base}?${qs}` : base;
};

export function RunnerChips({ runners, size = 30 }) {
  return (
    <span className="fg-runners">
      {runners.map((r) => (
        <Link key={r.id} to={`/fullgame/runners/${r.id}`} className="fg-runner">
          <Avatar src={r.avatar} name={r.name} size={size} />
          <span>{r.name}</span>
        </Link>
      ))}
    </span>
  );
}

const isYouTube = (url) => /(?:youtube\.com|youtu\.be)\//i.test(url || "");

export function youtubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export function ProofIcons({ run }) {
  return (
    <span className="fg-proof">
      <CommentIcon className={run.comment ? "" : "is-off"} titleAccess={run.comment || "No comment"} />
      {run.video_url ? (
        <a href={run.video_url} target="_blank" rel="noreferrer" title="Video">
          {isYouTube(run.video_url) ? <YouTubeIcon /> : <PlayIcon />}
        </a>
      ) : (
        <YouTubeIcon className="is-off" />
      )}
      {run.demo_url ? (
        <a href={run.demo_url} target="_blank" rel="noreferrer" title="Demos">
          <DownloadIcon />
        </a>
      ) : (
        // Uploaded demo archives are served by the board once demo downloads exist in v2.
        <DownloadIcon className={run.has_demo_file ? "" : "is-off"} titleAccess={run.has_demo_file ? "Demo uploaded (download not available yet)" : "No demos"} />
      )}
    </span>
  );
}

export function StatusBadge({ status }) {
  if (status === "verified") return null;
  return <span className={`fg-status is-${status}`}>{status}</span>;
}
