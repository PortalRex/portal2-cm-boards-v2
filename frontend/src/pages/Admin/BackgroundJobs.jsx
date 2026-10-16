import { useCallback, useEffect, useState } from "react";
import { EmptyState, Loading } from "../../components/ui";
import { fetchJobs, runJob } from "../../api/client";
import { bumpDataVersion } from "../../lib/dataVersion";
import { formatDateTime, timeAgo } from "../../lib/format";
import "./BackgroundJobs.css";

// What each job's buttons do: [label, query] (the old-board pull also has a dry run).
const ACTIONS = {
  steam_sync: [["Run now", ""]],
  old_boards_sync: [
    ["Run now", ""],
    ["Dry run", "dry_run=true"],
  ],
  demo_parse: [["Run now", "limit=200"]],
};

// Admins: the Steam sync, old-board pull and demo parsing, each with its schedule, its last run
// (since the server started) and a button to run it now.
export default function BackgroundJobs() {
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [messages, setMessages] = useState({});

  const load = useCallback(
    () =>
      fetchJobs().then(
        (j) => {
          setJobs(j);
          setError(null);
        },
        (e) => setError(e.message),
      ),
    [],
  );
  const anyRunning = (jobs || []).some((j) => j.last?.running);
  useEffect(() => {
    load();
    // Faster while something is running, so the result shows up as soon as it's done.
    const timer = setInterval(load, anyRunning || busy ? 3000 : 15000);
    return () => clearInterval(timer);
  }, [load, anyRunning, busy]);

  const run = async (job, label, query) => {
    setBusy(`${job.key}:${label}`);
    setMessages((m) => ({ ...m, [job.key]: null }));
    load();
    try {
      await runJob(job.key, query);
      if (!query.includes("dry_run")) bumpDataVersion();
    } catch (e) {
      setMessages((m) => ({ ...m, [job.key]: e.message }));
    } finally {
      setBusy(null);
      load();
    }
  };

  if (error && !jobs) return <EmptyState>Couldn’t load the background jobs: {error}</EmptyState>;
  if (!jobs) return <Loading />;
  return (
    <div className="bj">
      <p className="muted bj-intro">These run by themselves on their schedules; run one now if you don’t want to wait. Each shows its last run since the server started.</p>
      {jobs.map((job) => {
        const last = job.last;
        return (
          <section key={job.key} className="bj-job">
            <div className="bj-head">
              <h3>{job.name}</h3>
              <span className={`bj-state${job.enabled ? " is-on" : ""}`}>{job.enabled ? "On" : "Off"}</span>
              <span className="muted bj-schedule">{job.enabled ? job.schedule : "Not running on a schedule"}</span>
            </div>
            <div className="bj-last">
              {!last ? (
                <span className="muted">Hasn’t run since the server started.</span>
              ) : last.running ? (
                <span className="bj-running">Running… started {timeAgo(last.started_at)}{last.trigger && last.trigger !== "schedule" ? ` by ${last.trigger}` : " on its schedule"}</span>
              ) : (
                <>
                  <span className={`bj-dot${last.ok ? " is-ok" : " is-bad"}`} aria-hidden="true" />
                  <span className="bj-when" title={formatDateTime(last.finished_at)}>
                    {last.dry_run ? "Dry run " : "Last run "}
                    {timeAgo(last.finished_at)}
                    {last.trigger && last.trigger !== "schedule" ? ` · by ${last.trigger}` : " · on its schedule"}
                  </span>
                  {last.summary && <span className={`bj-summary${last.ok ? "" : " is-bad"}`}>{last.summary}</span>}
                </>
              )}
            </div>
            <div className="bj-actions">
              {(ACTIONS[job.key] || []).map(([label, query]) => (
                <button key={label} type="button" className="outline-button" disabled={Boolean(busy) || last?.running} onClick={() => run(job, label, query)}>
                  {busy === `${job.key}:${label}` ? "Running…" : label}
                </button>
              ))}
              {messages[job.key] && <span className="bj-error">{messages[job.key]}</span>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
