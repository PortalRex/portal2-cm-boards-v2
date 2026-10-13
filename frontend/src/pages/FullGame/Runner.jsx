import { Link, Navigate, useParams } from "react-router-dom";
import Layout from "../../components/Layout";
import { Avatar, Loading, EmptyState, RankNumber } from "../../components/ui";
import { fetchFgRunner, formatRunTime } from "../../api/fullgame";
import useApi from "../../hooks/useApi";
import { formatDate } from "../../lib/format";
import { boardPath, ProofIcons, StatusBadge } from "./shared";
import background from "../../scenes/global/img/Background.png";
import "./FullGame.css";

export default function Runner() {
  const { id } = useParams();
  const page = useApi(() => fetchFgRunner(id), [id]);
  const p = page.data;
  if (!page.loading && !p) return <Navigate to="/fullgame" replace />;
  if (!p) return <Layout><Loading /></Layout>;
  const { runner, runs } = p;
  const wrs = runs.filter((r) => r.rank === 1).length;
  const current = runs.filter((r) => r.rank != null).length;

  return (
    <Layout background={runner.avatar || background} blur narrow>
      <div className="fg-page">
        <nav className="fg-breadcrumb">
          <Link to="/fullgame">Full Game</Link> › Runners
        </nav>
        <section className="fg-runner-head">
          <Avatar src={runner.avatar} name={runner.name} size={96} className="fg-runner-avatar" />
          <div>
            <h1>{runner.name}</h1>
            <p className="muted">
              {runner.profile_number ? (
                <Link to={`/profile/${runner.profile_number}`}>Challenge Mode profile</Link>
              ) : runner.src_user_id ? (
                "speedrun.com runner (not yet linked to a board profile)"
              ) : (
                "Guest runner"
              )}
            </p>
          </div>
          <dl className="fg-runner-stats">
            <div>
              <dd className="num">{current}</dd>
              <dt>Current runs</dt>
            </div>
            <div>
              <dd className="num">{wrs}</dd>
              <dt>World records</dt>
            </div>
          </dl>
        </section>

        <section className="fg-board-panel">
          {runs.length ? (
            <div className="fg-table fg-runner-table" role="table">
              <div className="fg-row fg-row-head" role="row">
                <span className="fg-rank">#</span>
                <span>Category</span>
                <span className="fg-attr">Partner</span>
                <span className="fg-proof-head">Proof</span>
                <span className="fg-date">Date</span>
                <span className="end">Time</span>
              </div>
              {runs.map((run) => {
                const subcats = run.values.filter((v) => v.is_subcategory);
                const partners = run.runners.filter((r) => String(r.id) !== String(runner.id));
                return (
                  <div key={run.id} className={`fg-row${run.obsolete ? " is-obsolete" : ""}`} role="row">
                    <span className="fg-rank num">
                      <RankNumber rank={run.rank} empty={run.status === "verified" ? "–" : ""} />
                    </span>
                    <Link to={boardPath(run.game_slug, run.category_slug, run.level_slug, Object.fromEntries(subcats.map((v) => [`v${v.variable_id}`, v.slug])))} className="fg-run-cat">
                      {run.category_name}
                      <small className="muted">
                        {[run.level_name, ...subcats.map((v) => v.label)].filter(Boolean).join(" · ")}
                      </small>
                      <StatusBadge status={run.status} />
                    </Link>
                    <span className="fg-attr">
                      {partners.map((r) => (
                        <Link key={r.id} to={`/fullgame/runners/${r.id}`}>
                          {r.name}
                        </Link>
                      ))}
                    </span>
                    <ProofIcons run={run} />
                    <span className="fg-date muted num">{formatDate(run.run_date)}</span>
                    <Link className="fg-time num end" to={`/fullgame/runs/${run.id}`}>
                      {formatRunTime(run.time_ms)}
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState>No runs yet.</EmptyState>
          )}
        </section>
      </div>
    </Layout>
  );
}
