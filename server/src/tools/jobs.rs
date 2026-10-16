//! The background jobs' last runs (Steam sync, old-board pull, demo parsing), for the admin
//! page's Background jobs section: when each last ran, whether on its schedule or by hand, and
//! what it did. Kept in memory: a restart starts the list over.
use chrono::{NaiveDateTime, Utc};
use serde::Serialize;
use std::{
    collections::HashMap,
    future::Future,
    sync::{Mutex, OnceLock},
};

pub const STEAM_SYNC: &str = "steam_sync";
pub const OLD_BOARDS: &str = "old_boards_sync";
pub const DEMO_PARSE: &str = "demo_parse";

#[derive(Debug, Clone, Default, Serialize)]
pub struct JobRun {
    pub running: bool,
    pub started_at: Option<NaiveDateTime>,
    pub finished_at: Option<NaiveDateTime>,
    /// "schedule", or "<name>" for a run started from the admin page.
    pub trigger: Option<String>,
    pub ok: Option<bool>,
    /// One line on what it did (or the error).
    pub summary: Option<String>,
    /// Whether the last run was only a dry run (old-board pull).
    pub dry_run: bool,
}

fn table() -> &'static Mutex<HashMap<&'static str, JobRun>> {
    static TABLE: OnceLock<Mutex<HashMap<&'static str, JobRun>>> = OnceLock::new();
    TABLE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// The last run of every job that has run since the server started.
pub fn snapshot() -> HashMap<&'static str, JobRun> {
    table().lock().map(|t| t.clone()).unwrap_or_default()
}

/// Whether a job is running right now.
pub fn is_running(job: &'static str) -> bool {
    table().lock().map(|t| t.get(job).is_some_and(|r| r.running)).unwrap_or(false)
}

/// Runs `work` as a run of `job`, recording when it started and finished, who started it and
/// `summary` of its result.
pub async fn track<T, E, F>(job: &'static str, trigger: &str, dry_run: bool, summary: impl Fn(&T) -> String, work: F) -> Result<T, E>
where
    E: std::fmt::Display,
    F: Future<Output = Result<T, E>>,
{
    let now = || Utc::now().naive_utc();
    if let Ok(mut t) = table().lock() {
        let run = t.entry(job).or_default();
        run.running = true;
        run.started_at = Some(now());
        run.trigger = Some(trigger.to_string());
        run.dry_run = dry_run;
    }
    // If the run is dropped part-way (e.g. its request was cut off), it's marked as interrupted
    // rather than left "running".
    struct Unfinished(&'static str);
    impl Drop for Unfinished {
        fn drop(&mut self) {
            if let Ok(mut t) = table().lock() {
                let run = t.entry(self.0).or_default();
                if run.running {
                    run.running = false;
                    run.finished_at = Some(Utc::now().naive_utc());
                    run.ok = Some(false);
                    run.summary = Some("Interrupted before it finished.".to_string());
                }
            }
        }
    }
    let guard = Unfinished(job);
    let result = work.await;
    std::mem::forget(guard);
    if let Ok(mut t) = table().lock() {
        let run = t.entry(job).or_default();
        run.running = false;
        run.finished_at = Some(now());
        match &result {
            Ok(value) => {
                run.ok = Some(true);
                run.summary = Some(summary(value));
            }
            Err(e) => {
                run.ok = Some(false);
                run.summary = Some(e.to_string());
            }
        }
    }
    result
}
