import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchShareIds, renderRequestUrl, videoLinks } from "../api/autorender";
import { demoUrl } from "../api/client";
import { CommentIcon, DownloadIcon, PlayIcon, YouTubeIcon, VideocamIcon } from "./Icons";
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

// A run's comment icon: clicking it (which doesn't open the row) shows just the comment in a small
// bubble above it; clicking again or anywhere else closes it. Greyed out without a comment.
export function CommentButton({ note, className = "" }) {
  const ref = useRef(null);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState(null);
  const open = Boolean(note) && pinned;
  const place = () => {
    const r = ref.current?.getBoundingClientRect();
    // Centred over the icon, but kept inside the window (the bubble is up to 320px wide).
    const half = Math.min(160, window.innerWidth * 0.4);
    if (r) setPos({ x: Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8), y: r.top });
  };
  // A pinned bubble closes on a click elsewhere or when the page scrolls (it's fixed in place).
  useEffect(() => {
    if (!pinned) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setPinned(false);
    const scroll = () => setPinned(false);
    document.addEventListener("pointerdown", close);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [pinned]);
  if (!note) return <CommentIcon className={`is-off ${className}`} titleAccess="No comment" />;
  return (
    <span className={`comment-btn ${className}`} ref={ref}>
      <button
        type="button"
        className="run-link"
        aria-label="Show comment"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          place();
          setPinned((p) => !p);
        }}
      >
        <CommentIcon />
      </button>
      {/* On the page body: a row's hover filter would otherwise pin a fixed bubble to the row. */}
      {open &&
        pos &&
        createPortal(
          <span className="comment-bubble" role="tooltip" style={{ left: pos.x, top: pos.y }}>
            {note}
          </span>,
          document.body,
        )}
    </span>
  );
}

// Downloads the run's demo straight away (doesn't open the row). Greyed out without a demo,
// or hidden with `hideMissing`.
export function DemoLink({ demoId, size, hideMissing = false }) {
  const style = size ? { fontSize: size } : undefined;
  if (!demoId) return hideMissing ? null : <DownloadIcon className="is-off" style={style} titleAccess="No demo" />;
  return (
    <a href={demoUrl(demoId)} download className="run-link" title="Download demo" onClick={(e) => e.stopPropagation()}>
      <DownloadIcon style={style} />
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
