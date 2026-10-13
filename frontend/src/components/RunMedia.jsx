import { useEffect, useMemo, useState } from "react";
import { fetchShareIds, renderRequestUrl, videoLinks } from "../api/autorender";
import { PlayIcon, YouTubeIcon, VideocamIcon } from "./Icons";
import { YouTubeEmbed } from "./ui";
import "./RunMedia.css";

const youtubeUrl = (id) => `https://www.youtube.com/watch?v=${id.split("?")[0]}`;

// Runs carry the share id of their autorender video (autorenderId, imported from
// autorender). For Portal 2 runs without one, this asks autorender whether a video has been
// rendered since, as Map(changelogId -> shareId).
export function useRenderedSet(entries, game = "portal2") {
  const ids = useMemo(
    () => (game === "portal2" ? (entries || []).filter((e) => !e.autorenderId).map((e) => e.changelogId ?? e.id).filter((id) => id != null) : []),
    [entries, game],
  );
  const key = ids.join(",");
  const [shareIds, setShareIds] = useState(() => new Map());
  useEffect(() => {
    if (!ids.length) return undefined;
    let cancelled = false;
    fetchShareIds(ids, game)
      .then((map) => !cancelled && setShareIds(map))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return shareIds;
}

// Video state for a run (score update, board entry or profile score).
export function runVideo(run, game, shareIds) {
  const changelogId = run.changelogId ?? run.id ?? null;
  const shareId = run.autorenderId || (changelogId != null ? shareIds?.get(Number(changelogId)) : null);
  if (shareId) return { ready: true, ...videoLinks(shareId) };
  return { ready: false, render: changelogId != null && run.demoId ? renderRequestUrl(game, changelogId) : null };
}

// ▶ icon: opens the autorender video, or offers to request a render.
export function AutorenderLink({ run, game = "portal2", rendered, size }) {
  const video = runVideo(run, game, rendered);
  const style = size ? { fontSize: size } : undefined;
  if (video.ready) {
    return (
      <a href={video.page} target="_blank" rel="noreferrer" className="run-link" title="Watch autorender">
        <PlayIcon style={style} />
      </a>
    );
  }
  if (!video.render) return <PlayIcon className="is-off" style={style} titleAccess="No autorender" />;
  return (
    <a href={video.render} target="_blank" rel="noreferrer" className="run-link is-request" title="Request an autorender">
      <VideocamIcon style={style} />
    </a>
  );
}

export function YouTubeLink({ id, size }) {
  const style = size ? { fontSize: size } : undefined;
  if (!id) return <YouTubeIcon className="is-off" style={style} />;
  return (
    <a href={youtubeUrl(id)} target="_blank" rel="noreferrer" className="run-link" title="Watch on YouTube">
      <YouTubeIcon style={style} />
    </a>
  );
}

// Video area: autorender first, then YouTube, then a prompt to request a render.
export function RunVideo({ run, game = "portal2", rendered, title }) {
  const video = runVideo(run, game, rendered);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [video.src]);

  if (video.ready && !failed) {
    return (
      <div className="run-video">
        {/* The browser tries each source in turn; only the last one failing means no video. */}
        <video key={video.src} controls preload="metadata" title={title}>
          {video.sources.map((src, i) => (
            <source key={src} src={src} type="video/mp4" onError={i === video.sources.length - 1 ? () => setFailed(true) : undefined} />
          ))}
        </video>
        <a className="run-video-source" href={video.page} target="_blank" rel="noreferrer">
          Autorender
        </a>
      </div>
    );
  }
  if (run.youtubeId) return <YouTubeEmbed id={run.youtubeId} title={title} />;
  return (
    <div className="yt-embed yt-empty run-video-empty">
      <span>{video.ready ? "The video couldn’t be played here." : "No video"}</span>
      {video.ready ? (
        <a href={video.page} target="_blank" rel="noreferrer">
          Watch on autorender
        </a>
      ) : (
        video.render && (
          <a href={video.render} target="_blank" rel="noreferrer">
            Request an autorender
          </a>
        )
      )}
    </div>
  );
}
