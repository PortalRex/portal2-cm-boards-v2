import { Link, Navigate, useParams } from "react-router-dom";
import Layout from "../../components/Layout";
import { Loading, YouTubeEmbed, OutlineButton } from "../../components/ui";
import { DownloadIcon, PlayIcon, TrophyIcon } from "../../components/Icons";
import { fetchFgRun, formatRunTime } from "../../api/fullgame";
import useApi from "../../hooks/useApi";
import { formatDate, ordinalSuffix } from "../../lib/format";
import { bannerImage, boardPath, RunnerChips, StatusBadge, youtubeId } from "./shared";
import "./FullGame.css";

const EVENT_LABELS = {
  submitted: "Submitted",
  verified: "Verified",
  rejected: "Rejected",
  reopened: "Reopened",
  edited: "Edited",
  imported: "Imported from speedrun.com",
  demo_uploaded: "Demo uploaded",
  resubmitted: "Resubmitted",
  demo_removed: "Demo removed",
};

export default function Run() {
  const { id } = useParams();
  const page = useApi(() => fetchFgRun(id), [id]);
  const run = page.data;
  if (!page.loading && !run) return <Navigate to="/fullgame" replace />;
  if (!run) return <Layout><Loading /></Layout>;

  const subcats = Object.fromEntries(run.values.filter((v) => v.is_subcategory).map((v) => [`v${v.variable_id}`, v.slug]));
  const board = boardPath(run.game_slug, run.category_slug, run.level_slug, subcats);
  const yt = youtubeId(run.video_url);
  const category = { players: run.players };

  return (
    <Layout background={bannerImage(category)} blur narrow>
      <div className="fg-page">
        <nav className="fg-breadcrumb">
          <Link to="/fullgame">Full Game</Link> › <Link to={`/fullgame/${run.game_slug}`}>{run.game_name}</Link> ›{" "}
          <Link to={board}>
            {run.category_name}
            {run.level_name ? ` – ${run.level_name}` : ""}
          </Link>
        </nav>

        <section className="fg-run">
          <div className="fg-run-head">
            <div>
              <span className="fg-banner-small">
                {run.category_name}
                {run.level_name ? ` – ${run.level_name}` : ""}
              </span>
              <h1 className="num">{formatRunTime(run.time_ms)}</h1>
              <RunnerChips runners={run.runners} size={40} />
            </div>
            <div className="fg-run-rank">
              {run.rank ? (
                <>
                  {run.rank === 1 && <TrophyIcon className="fg-trophy" />}
                  <span className="num">
                    {run.rank}
                    <small>{ordinalSuffix(run.rank)}</small>
                  </span>
                  <span className="muted">place</span>
                </>
              ) : run.obsolete ? (
                <span className="muted">Obsolete</span>
              ) : (
                <StatusBadge status={run.status} />
              )}
            </div>
          </div>

          <div className="fg-run-body">
            <div className="fg-run-video">
              {yt ? (
                <YouTubeEmbed id={yt} title="Run video" />
              ) : run.video_url ? (
                <div className="yt-embed yt-empty run-video-empty">
                  <span>Video hosted elsewhere</span>
                  <a href={run.video_url} target="_blank" rel="noreferrer">
                    Watch video
                  </a>
                </div>
              ) : (
                <div className="yt-embed yt-empty">No video</div>
              )}
            </div>
            <dl className="fg-run-facts">
              <dt>Date</dt>
              <dd className="num">{formatDate(run.run_date) || "–"}</dd>
              {run.values.map((v) => (
                <div key={v.variable_id} className="fg-fact">
                  <dt>{v.variable}</dt>
                  <dd>{v.label}</dd>
                </div>
              ))}
              <dt>Status</dt>
              <dd>
                {run.status}
                {run.examiner_name ? ` by ${run.examiner_name}` : ""}
                {run.examined_at ? ` on ${formatDate(run.examined_at)}` : ""}
              </dd>
              {run.reject_reason && (
                <>
                  <dt>Reason</dt>
                  <dd>{run.reject_reason}</dd>
                </>
              )}
              <dt>Comment</dt>
              <dd className="fg-comment">{run.comment || "No comment"}</dd>
            </dl>
          </div>

          <div className="fg-run-buttons">
            {run.video_url && (
              <OutlineButton as="a" href={run.video_url} target="_blank" rel="noreferrer">
                Video <PlayIcon />
              </OutlineButton>
            )}
            {run.demo_url ? (
              <OutlineButton as="a" href={run.demo_url} target="_blank" rel="noreferrer">
                Demos <DownloadIcon />
              </OutlineButton>
            ) : (
              <OutlineButton disabled title={run.has_demo_file ? "Demo downloads are not available yet" : "No demos for this run"}>
                Demos <DownloadIcon />
              </OutlineButton>
            )}
            <OutlineButton as={Link} to={board}>
              View leaderboard
            </OutlineButton>
          </div>

          {run.events.length > 0 && (
            <section className="fg-history">
              <h2>History</h2>
              <ul>
                {run.events.map((e, i) => (
                  <li key={i}>
                    <span className="num muted">{formatDate(e.created_at)}</span>
                    <span>
                      {EVENT_LABELS[e.action] || e.action}
                      {e.actor_name ? ` by ${e.actor_name}` : ""}
                    </span>
                    {e.note && <span className="muted">{e.note}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>
      </div>
    </Layout>
  );
}
