//! Pulls from the old boards (board.portal2.sr and the Mel board) until they're retired: what
//! Steam can't tell us, such as Mel runs, demo and video submissions, comments and staff
//! decisions. Runs at `SYNC.OLD_BOARDS_HOURS` (midnight and noon, America/Chicago, by default).
//!
//! Each pull reads the old board's changelog from `SYNC.OLD_BOARDS_DAYS` days back (further when
//! the newest run we have from it is older) and, per entry:
//! - a run we already have from that board (`legacy_changelog_ids`) gets what changed there
//!   since the last pull (banned, pending, video, comment, autorender) plus a demo it's missing.
//!   What changed is judged against the entry as last seen (`old_board_runs`), so a change our
//!   staff made here isn't undone unless the old board changes it too.
//! - a run we have but not from that board (the Steam sync's copy: same player, map and time,
//!   within two days) is linked to it and takes the old board's date, ranks and status.
//! - anything else is added as the old board has it (date, ranks, status, comment, video, demo).
//!   Co-op halves are paired the way the import paired them: same map and time, set within
//!   three hours; else with the map's placeholder partner.
//!
//! Demos we have a record of but no file for (submitted after the demo archive was copied) are
//! downloaded from the old board too.
//!
//! Then a Steam sync run the old board still doesn't have, three days on (its Steam fetcher runs
//! in irregular batches, sometimes more than a day apart), is one the old board left out on
//! purpose, and is hidden (staff can see why in the audit log). If the old board adds it later,
//! the next pull links it and shows it again.
//!
//! A Steam sync run is deleted straight away when the old board already had an equal or better
//! time by the same player on the map when Steam showed it: the old board only takes improvements,
//! so it will never list it. That's the usual case of one run timed twice: Steam has the game's
//! time, a demo submission SAR's (a few hundredths apart, 15.01 and 14.98), so the two don't match.
//! It's deleted rather than hidden because a hidden run shows as banned in the player's history,
//! and this one did nothing wrong. The audit log keeps a copy of the row. The Steam sync won't add
//! it again, as it only takes times better than the player's best here.
use crate::{
    controllers::{
        moderation::{self, FILLER},
        submissions::BoardMap,
    },
    tools::{auth::AdminOrService, cache::CacheState, config::Config, points_cache, steam_sync},
};
use chrono::{Duration as Span, NaiveDateTime, TimeZone, Utc};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{json, Value};
use sqlx::{PgPool, Postgres, Transaction};
use std::{
    collections::{HashMap, HashSet},
    path::Path,
    time::Duration,
};

const PORTAL2_GAME_ID: i32 = 1;
const MEL_GAME_ID: i32 = 2;
/// A run we have and the old board's entry for it are the same run when set this close.
const MATCH_WINDOW_HOURS: i64 = 48;
/// Co-op halves set this close together with the same time are one run (as the import paired them).
const COOP_WINDOW_HOURS: i64 = 3;
/// A Steam sync run is only judged missing once the old board's newest entry is this much newer...
const MISSING_AFTER_MINUTES: i64 = 30;
/// ...and the run is at least this old: the old board takes Steam's times in irregular batches,
/// sometimes well over a day apart (38 hours in October 2026), so a run it hasn't listed yet
/// isn't missing until then.
const HIDE_AFTER_HOURS: i64 = 72;
const MAX_DEMO_BYTES: usize = 50 * 1024 * 1024;
/// Shown in the audit log for runs this hides.
const HIDDEN_REASON: &str = "Not on the old board (hidden by the old-board sync)";
const DUPLICATE_REASON: &str = "Steam's copy of a run the old board already has (it has an equal or better time from before this one), deleted by the old-board sync";
/// The note the first version of that rule left on the runs it hid instead: those are deleted too.
const SUPERSEDED_NOTE: &str = "The old board already has an equal or better time from before this one, so it won't list it (hidden by the old-board sync)";
const CHANGED_REASON: &str = "Changed on the old board";
/// At most this many missing demo files fetched per board per pull.
const MAX_DEMO_FILES: usize = 500;
/// At most this many lines of detail in a report.
const MAX_DETAILS: usize = 300;

/// What one pull of one board did (or, for a dry run, would do).
#[derive(Debug, Default, Serialize, Clone)]
pub struct BoardReport {
    pub board: String,
    pub dry_run: bool,
    pub since: String,
    pub entries: usize,
    /// Entries for runs we already had from that board.
    pub known: usize,
    /// Of those, ones updated from it.
    pub updated: usize,
    /// Entries linked to a run we had from Steam.
    pub matched: usize,
    pub inserted: usize,
    pub demos_added: usize,
    pub demos_failed: usize,
    /// Demo records whose file we didn't have (newer than the demo archive), downloaded again.
    pub demo_files_restored: usize,
    /// Of those, ones the old board couldn't give us (or, for a dry run, all of them).
    pub demo_files_missing: usize,
    /// Of those, ones the old board has lost too (not asked for again until the server restarts).
    pub demo_files_gone: usize,
    pub hidden: usize,
    /// Steam's copies of runs the old board already had, deleted.
    pub deleted: usize,
    pub players_created: usize,
    /// Entries on maps we don't have.
    pub skipped: usize,
    pub errors: Vec<String>,
    pub details: Vec<String>,
}

impl BoardReport {
    fn note(&mut self, line: String) {
        if self.details.len() < MAX_DETAILS {
            self.details.push(line);
        }
    }
}

/// One entry of an old board's `/changelog/json`.
#[derive(Debug, Deserialize, Clone)]
struct Entry {
    #[serde(deserialize_with = "int")]
    id: i64,
    profile_number: String,
    #[serde(deserialize_with = "int")]
    score: i64,
    #[serde(default, deserialize_with = "opt_int")]
    pre_rank: Option<i64>,
    #[serde(default, deserialize_with = "opt_int")]
    post_rank: Option<i64>,
    time_gained: Option<String>,
    #[serde(rename = "hasDemo", default, deserialize_with = "opt_int")]
    has_demo: Option<i64>,
    #[serde(rename = "youtubeID")]
    youtube_id: Option<String>,
    note: Option<String>,
    #[serde(default, deserialize_with = "opt_int")]
    banned: Option<i64>,
    #[serde(default, deserialize_with = "opt_int")]
    submission: Option<i64>,
    #[serde(default, deserialize_with = "opt_int")]
    pending: Option<i64>,
    autorender_id: Option<String>,
    mapid: String,
}

/// The old boards send numbers, but PHP may hand some over as strings.
fn opt_int<'de, D: Deserializer<'de>>(d: D) -> Result<Option<i64>, D::Error> {
    Ok(match Value::deserialize(d)? {
        Value::Number(n) => n.as_i64(),
        Value::String(s) => s.trim().parse().ok(),
        Value::Bool(b) => Some(b as i64),
        _ => None,
    })
}

fn int<'de, D: Deserializer<'de>>(d: D) -> Result<i64, D::Error> {
    opt_int(d)?.ok_or_else(|| serde::de::Error::custom("expected a number"))
}

/// An entry's values as we store them.
#[derive(Debug, Clone, PartialEq)]
struct Seen {
    banned: bool,
    pending: bool,
    youtube_id: Option<String>,
    note: Option<String>,
    has_demo: bool,
    autorender_id: Option<String>,
}

impl Entry {
    fn when(&self) -> Option<NaiveDateTime> {
        let t = self.time_gained.as_deref()?;
        NaiveDateTime::parse_from_str(t.trim_end_matches('Z'), "%Y-%m-%dT%H:%M:%S").ok()
    }
    fn seen(&self) -> Seen {
        Seen {
            banned: self.banned.unwrap_or(0) != 0,
            pending: self.pending.unwrap_or(0) != 0,
            youtube_id: clean(self.youtube_id.as_deref(), 30),
            note: self.note.as_deref().map(unescape_note).and_then(|n| clean(Some(&n), 100)),
            has_demo: self.has_demo.unwrap_or(0) != 0,
            autorender_id: clean(self.autorender_id.as_deref(), 11),
        }
    }
}

fn clean(value: Option<&str>, max: usize) -> Option<String> {
    let v = value?.trim();
    (!v.is_empty()).then(|| v.chars().take(max).collect())
}

/// The old boards send comments HTML-escaped, and stored them PHP-escaped (a backslash before
/// quotes and backslashes); keep them as typed (as the import does).
fn unescape_note(note: &str) -> String {
    let html = note.replace("&quot;", "\"").replace("&#039;", "'").replace("&#39;", "'").replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&");
    let mut out = String::with_capacity(html.len());
    let mut chars = html.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\\' && matches!(chars.peek(), Some('\'' | '"' | '\\')) {
            out.push(chars.next().unwrap_or_default());
        } else {
            out.push(c);
        }
    }
    out
}

/// (game, old board id) of demos the old board has lost too, so they aren't asked for every pull.
static GONE_DEMOS: std::sync::Mutex<Option<HashSet<(i32, i64)>>> = std::sync::Mutex::new(None);
const GONE: &str = "the old board has lost this demo too";

fn is_gone(game_id: i32, legacy_id: i64) -> bool {
    GONE_DEMOS.lock().map(|g| g.as_ref().is_some_and(|set| set.contains(&(game_id, legacy_id)))).unwrap_or(false)
}

/// One pull at a time (the schedule and the staff endpoint share it).
static RUNNING: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Starts the schedule (no-op when `SYNC.OLD_BOARDS` is off).
pub fn start(pool: PgPool, config: Config, cache: CacheState) {
    if !config.sync.old_boards() {
        log::info!("old-board sync: off (SYNC.OLD_BOARDS)");
        return;
    }
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(until_next(&config)).await;
            match crate::tools::jobs::track(crate::tools::jobs::OLD_BOARDS, "schedule", false, summary, run_once(&pool, &config, &cache, false, None)).await {
                Ok(reports) => {
                    for r in reports {
                        log::info!(
                            "old-board sync {}: {} entries since {}: {} updated, {} linked to Steam runs, {} added, {} demos added ({} failed), {} hidden, {} skipped{}",
                            r.board, r.entries, r.since, r.updated, r.matched, r.inserted, r.demos_added, r.demos_failed, r.hidden, r.skipped,
                            if r.errors.is_empty() { String::new() } else { format!("; errors: {}", r.errors.join("; ")) }
                        );
                    }
                }
                Err(e) => log::error!("old-board sync failed: {e}"),
            }
        }
    });
}

/// What a pull did, in one line per board (admin page).
pub fn summary(reports: &Vec<BoardReport>) -> String {
    reports
        .iter()
        .map(|r| {
            format!(
                "{}: {} added, {} linked to Steam runs, {} updated, {} demos added, {} hidden, {} duplicates deleted{}",
                r.board, r.inserted, r.matched, r.updated, r.demos_added, r.hidden, r.deleted,
                if r.errors.is_empty() { String::new() } else { format!(", {} errors", r.errors.len()) }
            )
        })
        .collect::<Vec<_>>()
        .join(" · ")
}

/// The schedule in words (admin page).
pub fn schedule(config: &Config) -> String {
    let mut hours = config.sync.old_boards_hours();
    hours.sort_unstable();
    let list: Vec<String> = hours.iter().map(|h| format!("{h:02}:00")).collect();
    format!("Daily at {} ({})", list.join(" and "), config.sync.old_boards_tz().name())
}

/// Time until the next scheduled hour (on the hour, in the configured time zone).
fn until_next(config: &Config) -> Duration {
    let tz = config.sync.old_boards_tz();
    let mut hours = config.sync.old_boards_hours();
    hours.sort_unstable();
    let now = Utc::now().with_timezone(&tz);
    for day in 0..3 {
        let date = now.date_naive() + Span::days(day);
        for &h in &hours {
            let Some(local) = date.and_hms_opt(h, 0, 0) else { continue };
            if let Some(t) = tz.from_local_datetime(&local).earliest() {
                if t > now {
                    return (t - now).to_std().unwrap_or(Duration::from_secs(3600));
                }
            }
        }
    }
    Duration::from_secs(12 * 3600)
}

/// Pulls each old board (or just `only`, a game id). With `dry_run`, nothing is written or
/// downloaded and the reports say what would happen.
pub async fn run_once(pool: &PgPool, config: &Config, cache: &CacheState, dry_run: bool, only: Option<i32>) -> Result<Vec<BoardReport>, sqlx::Error> {
    let _guard = RUNNING.lock().await;
    let client = match reqwest::Client::builder().timeout(Duration::from_secs(120)).user_agent("p2cm-boards old-board sync").build() {
        Ok(c) => c,
        Err(e) => {
            log::error!("old-board sync: {e}");
            return Ok(Vec::new());
        }
    };
    let boards = [(PORTAL2_GAME_ID, "Portal 2", config.sync.portal2_board_url()), (MEL_GAME_ID, "Portal Stories: Mel", config.sync.mel_board_url())];
    let mut reports = Vec::new();
    let mut touched: HashSet<(String, bool)> = HashSet::new();
    for (game_id, name, url) in boards {
        if only.is_some_and(|g| g != game_id) {
            continue;
        }
        let mut report = BoardReport { board: name.to_string(), dry_run, ..Default::default() };
        pull(pool, config, &client, game_id, &url, dry_run, &mut report, &mut touched).await?;
        reports.push(report);
    }
    if !dry_run && !touched.is_empty() {
        for (map_id, is_coop) in &touched {
            if cache.default_cat_ids.contains_key(map_id) {
                cache.reload_rank(pool, map_id, config, *is_coop).await;
            }
        }
        cache.update_current_states(&[crate::tools::cache::SP_PREVIEWS, crate::tools::cache::COOP_PREVIEWS], &[false, false]).await;
        points_cache::invalidate_points().await;
    }
    Ok(reports)
}

#[allow(clippy::too_many_arguments)]
async fn pull(
    pool: &PgPool,
    config: &Config,
    client: &reqwest::Client,
    game_id: i32,
    url: &str,
    dry_run: bool,
    report: &mut BoardReport,
    touched: &mut HashSet<(String, bool)>,
) -> Result<(), sqlx::Error> {
    // From DAYS back, or a day before the newest run we have from this board if that's older.
    let newest: Option<NaiveDateTime> = sqlx::query_scalar(
        "SELECT MAX(c.timestamp) FROM legacy_changelog_ids AS l JOIN changelog AS c ON c.id = l.changelog_id WHERE l.game_id = $1",
    )
    .bind(game_id)
    .fetch_one(pool)
    .await?;
    let now = Utc::now().naive_utc();
    let mut since = now - Span::days(config.sync.old_boards_days());
    // Far enough back to cover the runs old enough to judge (HIDE_AFTER_HOURS) with a day to spare.
    since = since.min(now - Span::hours(HIDE_AFTER_HOURS + 24));
    if let Some(n) = newest {
        since = since.min(n - Span::days(1));
    }
    let since_day = since.date();
    report.since = since_day.to_string();

    let entries: Vec<Entry> = match fetch(client, &format!("{url}/changelog/json?startDate={since_day}")).await {
        Ok(e) => e,
        Err(e) => {
            report.errors.push(format!("couldn't read the changelog: {e}"));
            return Ok(());
        }
    };
    let mut entries: Vec<Entry> = entries.into_iter().filter(|e| e.score > 0 && e.score <= i32::MAX as i64).collect();
    entries.sort_by_key(|e| (e.when(), e.id));
    report.entries = entries.len();

    let maps: HashMap<String, BoardMap> = sqlx::query_as::<_, BoardMap>(
        r#"
            SELECT m.steam_id, m.name, c.game_id, c.game_mode, c.is_multiplayer AS is_coop, m.default_cat_id
            FROM maps AS m JOIN chapters AS c ON c.id = m.chapter_id
            WHERE c.game_id = $1 AND m.default_cat_id IS NOT NULL
        "#,
    )
    .bind(game_id)
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|m| (m.steam_id.clone(), m))
    .collect();

    // Runs this pull linked or added, so the missing check doesn't count them.
    let mut accounted: HashSet<i64> = HashSet::new();
    for e in &entries {
        let Some(map) = maps.get(&e.mapid) else {
            report.skipped += 1;
            continue;
        };
        if let Err(err) = apply_entry(pool, config, client, url, game_id, map, e, dry_run, report, touched, &mut accounted).await {
            log::error!("old-board sync: entry {} ({}): {err}", e.id, report.board);
            report.errors.push(format!("entry {}: {err}", e.id));
        }
    }

    hide_missing(pool, game_id, since, &entries, &accounted, dry_run, report, touched).await?;
    delete_duplicates(pool, game_id, since, &accounted, dry_run, report, touched).await?;
    restore_demo_files(pool, config, client, url, game_id, dry_run, report).await
}

/// Downloads the files of this board's demos that we have a record of but no file for (demos
/// submitted after the demo archive was copied), from the old board.
async fn restore_demo_files(pool: &PgPool, config: &Config, client: &reqwest::Client, url: &str, game_id: i32, dry_run: bool, report: &mut BoardReport) -> Result<(), sqlx::Error> {
    if config.demo.storage.as_deref().unwrap_or("").is_empty() {
        return Ok(());
    }
    let rows: Vec<(i64, String, i64, i64)> = sqlx::query_as(
        r#"
            SELECT d.id, d.file_id, c.id, l.legacy_id FROM demos AS d
                JOIN changelog AS c ON c.demo_id = d.id
                JOIN legacy_changelog_ids AS l ON l.changelog_id = c.id AND l.game_id = $1
            ORDER BY c.id DESC
        "#,
    )
    .bind(game_id)
    .fetch_all(pool)
    .await?;
    let mut fetched = 0;
    for (demo_id, file, cl_id, legacy_id) in rows {
        if crate::tools::demo_files::locate(&config.demo, &file, Some(cl_id)).await.is_some() {
            continue;
        }
        if is_gone(game_id, legacy_id) {
            report.demo_files_missing += 1;
            report.demo_files_gone += 1;
            continue;
        }
        if dry_run || fetched >= MAX_DEMO_FILES {
            report.demo_files_missing += 1;
            continue;
        }
        fetched += 1;
        match download_demo(config, client, url, legacy_id).await {
            Ok(name) => {
                // Read again now that its file is here.
                sqlx::query("UPDATE demos SET file_id = $2, parsed_at = NULL WHERE id = $1").bind(demo_id).bind(&name).execute(pool).await?;
                report.demo_files_restored += 1;
            }
            Err(err) if err == GONE => {
                report.demo_files_missing += 1;
                report.demo_files_gone += 1;
                if let Ok(mut g) = GONE_DEMOS.lock() {
                    g.get_or_insert_with(HashSet::new).insert((game_id, legacy_id));
                }
            }
            Err(err) => {
                report.demo_files_missing += 1;
                log::warn!("old-board sync: demo file for old board run {legacy_id} ({}): {err}", report.board);
            }
        }
    }
    Ok(())
}

async fn fetch(client: &reqwest::Client, url: &str) -> Result<Vec<Entry>, String> {
    let res = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    res.json::<Vec<Entry>>().await.map_err(|e| e.to_string())
}

#[derive(Debug, sqlx::FromRow)]
struct OurRun {
    id: i64,
    banned: bool,
    verified: Option<bool>,
    youtube_id: Option<String>,
    note: Option<String>,
    autorender_id: Option<String>,
    admin_note: Option<String>,
}

#[allow(clippy::too_many_arguments)]
async fn apply_entry(
    pool: &PgPool,
    config: &Config,
    client: &reqwest::Client,
    url: &str,
    game_id: i32,
    map: &BoardMap,
    e: &Entry,
    dry_run: bool,
    report: &mut BoardReport,
    touched: &mut HashSet<(String, bool)>,
    accounted: &mut HashSet<i64>,
) -> Result<(), sqlx::Error> {
    let new = e.seen();
    let when = e.when();
    let last: Option<Seen> = sqlx::query_as::<_, (bool, bool, Option<String>, Option<String>, bool, Option<String>)>(
        "SELECT banned, pending, youtube_id, note, has_demo, autorender_id FROM old_board_runs WHERE game_id = $1 AND legacy_id = $2",
    )
    .bind(game_id)
    .bind(e.id)
    .fetch_optional(pool)
    .await?
    .map(|(banned, pending, youtube_id, note, has_demo, autorender_id)| Seen { banned, pending, youtube_id, note, has_demo, autorender_id });
    let linked: Option<i64> = sqlx::query_scalar("SELECT changelog_id FROM legacy_changelog_ids WHERE game_id = $1 AND legacy_id = $2")
        .bind(game_id)
        .bind(e.id)
        .fetch_optional(pool)
        .await?;
    let who = format!("{} {} on {} ({})", e.profile_number, crate::controllers::submissions::format_time(e.score as i32), map.name, e.time_gained.as_deref().unwrap_or("undated"));

    // Which of our runs this is, and whether it's newly ours to take from the old board.
    let (run_id, fresh) = match linked {
        Some(id) => {
            report.known += 1;
            (Some(id), false)
        }
        None => {
            let matched: Option<i64> = match when {
                Some(t) => sqlx::query_scalar(
                    r#"
                        SELECT cl.id FROM changelog AS cl
                        WHERE cl.profile_number = $1 AND cl.map_id = $2 AND cl.score = $3 AND cl.mirror_of IS NULL
                          AND NOT EXISTS (SELECT 1 FROM legacy_changelog_ids AS l WHERE l.changelog_id = cl.id)
                          AND cl.timestamp BETWEEN $4 - make_interval(hours => $5) AND $4 + make_interval(hours => $5)
                        ORDER BY abs(extract(epoch FROM cl.timestamp - $4))
                        LIMIT 1
                    "#,
                )
                .bind(&e.profile_number)
                .bind(&map.steam_id)
                .bind(e.score as i32)
                .bind(t)
                .bind(MATCH_WINDOW_HOURS as i32)
                .fetch_optional(pool)
                .await?,
                None => None,
            };
            match matched {
                Some(id) => {
                    report.matched += 1;
                    report.note(format!("link: run {id} = old board {} ({who})", e.id));
                    (Some(id), true)
                }
                None => {
                    report.inserted += 1;
                    report.note(format!(
                        "add: old board {} ({who}){}{}{}",
                        e.id,
                        if new.banned { ", banned" } else { "" },
                        if new.pending { ", pending" } else { "" },
                        if new.has_demo { ", with demo" } else { "" }
                    ));
                    (None, true)
                }
            }
        }
    };
    if let Some(id) = run_id {
        accounted.insert(id);
    }
    if dry_run {
        if let (Some(id), Some(last)) = (run_id, &last) {
            if *last != new {
                report.updated += 1;
                report.note(format!("update: run {id} from old board {} ({who})", e.id));
            }
        }
        return Ok(());
    }

    if steam_sync::ensure_user(pool, config, &e.profile_number).await? {
        report.players_created += 1;
    }
    let mut tx = pool.begin().await?;
    let id = match run_id {
        Some(id) => id,
        None => insert(&mut tx, map, e, &new, when).await?,
    };
    accounted.insert(id);
    if run_id.is_none() || fresh {
        sqlx::query("INSERT INTO legacy_changelog_ids (game_id, legacy_id, changelog_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING")
            .bind(game_id)
            .bind(e.id)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    if run_id.is_some() {
        let ours: OurRun = sqlx::query_as("SELECT id, banned, verified, youtube_id, note, autorender_id, admin_note FROM changelog WHERE id = $1 FOR UPDATE")
            .bind(id)
            .fetch_one(&mut *tx)
            .await?;
        if update(&mut tx, &ours, e, &new, last.as_ref(), fresh, when).await? {
            report.updated += usize::from(!fresh);
            touched.insert((map.steam_id.clone(), map.is_coop));
        }
    } else {
        touched.insert((map.steam_id.clone(), map.is_coop));
    }
    if map.is_coop && !new.banned && fresh {
        pair(&mut tx, id, map, &e.profile_number, e.score as i32, when).await?;
    }
    sqlx::query(
        r#"
            INSERT INTO old_board_runs (game_id, legacy_id, banned, pending, youtube_id, note, has_demo, autorender_id, seen_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() AT TIME ZONE 'utc')
            ON CONFLICT (game_id, legacy_id) DO UPDATE SET banned = EXCLUDED.banned, pending = EXCLUDED.pending, youtube_id = EXCLUDED.youtube_id,
                note = EXCLUDED.note, has_demo = EXCLUDED.has_demo, autorender_id = EXCLUDED.autorender_id, seen_at = EXCLUDED.seen_at
        "#,
    )
    .bind(game_id)
    .bind(e.id)
    .bind(new.banned)
    .bind(new.pending)
    .bind(&new.youtube_id)
    .bind(&new.note)
    .bind(new.has_demo)
    .bind(&new.autorender_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    // The demo, when the old board has one and we don't.
    if new.has_demo {
        let has: bool = sqlx::query_scalar("SELECT demo_id IS NOT NULL FROM changelog WHERE id = $1").bind(id).fetch_one(pool).await?;
        if !has {
            match attach_demo(pool, config, client, url, e.id, id).await {
                Ok(()) => report.demos_added += 1,
                Err(err) => {
                    report.demos_failed += 1;
                    log::warn!("old-board sync: demo for old board run {} ({}): {err}", e.id, report.board);
                }
            }
        }
    }
    Ok(())
}

/// Adds the old board's run as it has it. Returns our id.
async fn insert(tx: &mut Transaction<'_, Postgres>, map: &BoardMap, e: &Entry, new: &Seen, when: Option<NaiveDateTime>) -> Result<i64, sqlx::Error> {
    let cat = map.default_cat_id.unwrap_or_default();
    // The player's best here before this run (what it improved on).
    let previous: Option<(i64, i32)> = sqlx::query_as(
        r#"
            SELECT id, score FROM changelog
            WHERE profile_number = $1 AND map_id = $2 AND category_id = $3 AND NOT banned AND mirror_of IS NULL
              AND ($4::timestamp IS NULL OR timestamp IS NULL OR timestamp <= $4)
            ORDER BY score ASC, id ASC
            LIMIT 1
        "#,
    )
    .bind(&e.profile_number)
    .bind(&map.steam_id)
    .bind(cat)
    .bind(when)
    .fetch_optional(&mut **tx)
    .await?;
    let score = e.score as i32;
    sqlx::query_scalar(
        r#"
            INSERT INTO changelog (timestamp, profile_number, score, map_id, banned, youtube_id, previous_id, post_rank, pre_rank,
                submission, note, category_id, score_delta, verified, autorender_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING id
        "#,
    )
    .bind(when)
    .bind(&e.profile_number)
    .bind(score)
    .bind(&map.steam_id)
    .bind(new.banned)
    .bind(&new.youtube_id)
    .bind(previous.map(|p| p.0))
    .bind(e.post_rank.map(|r| r as i32))
    .bind(e.pre_rank.map(|r| r as i32))
    .bind(e.submission.unwrap_or(0) as i32)
    .bind(&new.note)
    .bind(cat)
    .bind(previous.map(|p| score - p.1))
    .bind(!new.pending)
    .bind(&new.autorender_id)
    .fetch_one(&mut **tx)
    .await
}

/// Brings one of our runs up to date with the old board's entry. `fresh`: the run was just
/// linked, so it takes the old board's date, ranks and status outright; otherwise only what
/// changed there since `last` is applied (and blanks are filled). Returns whether anything changed.
async fn update(
    tx: &mut Transaction<'_, Postgres>,
    ours: &OurRun,
    e: &Entry,
    new: &Seen,
    last: Option<&Seen>,
    fresh: bool,
    when: Option<NaiveDateTime>,
) -> Result<bool, sqlx::Error> {
    let changed_there = |f: fn(&Seen) -> bool| last.map_or(fresh, |l| f(l) != f(new));
    let mut banned = ours.banned;
    let mut verified = ours.verified;
    let mut admin_note = ours.admin_note.clone();
    let mut actions: Vec<(&str, &str)> = Vec::new();
    if changed_there(|s| s.banned) && banned != new.banned {
        banned = new.banned;
        let ours_hid_it = ours.admin_note.as_deref() == Some(HIDDEN_REASON);
        if !banned && ours_hid_it {
            admin_note = None;
        }
        actions.push((if banned { "run.ban" } else { "run.unban" }, if ours_hid_it { "Now on the old board" } else { CHANGED_REASON }));
    }
    if changed_there(|s| s.pending) && verified != Some(!new.pending) {
        verified = Some(!new.pending);
        actions.push((if new.pending { "run.unverify" } else { "run.verify" }, CHANGED_REASON));
    }
    // Text: the old board's value when ours is blank or it changed there (never cleared).
    let take = |ours: &Option<String>, theirs: &Option<String>, last_theirs: Option<&Option<String>>| -> Option<String> {
        match theirs {
            Some(t) if ours.is_none() || last_theirs.map_or(fresh, |l| l != theirs) => Some(t.clone()),
            _ => ours.clone(),
        }
    };
    let youtube_id = take(&ours.youtube_id, &new.youtube_id, last.map(|l| &l.youtube_id));
    let note = take(&ours.note, &new.note, last.map(|l| &l.note));
    let autorender_id = take(&ours.autorender_id, &new.autorender_id, last.map(|l| &l.autorender_id));

    let changed = banned != ours.banned
        || verified != ours.verified
        || youtube_id != ours.youtube_id
        || note != ours.note
        || autorender_id != ours.autorender_id
        || admin_note != ours.admin_note
        || fresh;
    if !changed {
        return Ok(false);
    }
    sqlx::query(
        r#"
            UPDATE changelog SET banned = $2, verified = $3, youtube_id = $4, note = $5, autorender_id = $6, admin_note = $7,
                timestamp = CASE WHEN $8 AND $9::timestamp IS NOT NULL THEN $9 ELSE timestamp END,
                pre_rank = CASE WHEN $8 THEN $10 ELSE pre_rank END,
                post_rank = CASE WHEN $8 THEN $11 ELSE post_rank END
            WHERE id = $1
        "#,
    )
    .bind(ours.id)
    .bind(banned)
    .bind(verified)
    .bind(&youtube_id)
    .bind(&note)
    .bind(&autorender_id)
    .bind(&admin_note)
    .bind(fresh)
    .bind(when)
    .bind(e.pre_rank.map(|r| r as i32))
    .bind(e.post_rank.map(|r| r as i32))
    .execute(&mut **tx)
    .await?;
    for (action, reason) in actions {
        moderation::log_action(tx, &AdminOrService::Service, action, "run", &ours.id.to_string(), Some(reason), json!({ "old_board_id": e.id, "changelog_ids": [ours.id] })).await?;
    }
    Ok(true)
}

/// Pairs a co-op run with its partner's half (same map and time, set within
/// [COOP_WINDOW_HOURS], not paired with anyone real yet) when there's exactly one; else leaves
/// it with the placeholder partner.
async fn pair(tx: &mut Transaction<'_, Postgres>, id: i64, map: &BoardMap, profile: &str, score: i32, when: Option<NaiveDateTime>) -> Result<(), sqlx::Error> {
    let current: Option<(Option<i64>, Option<String>)> = sqlx::query_as(
        r#"
            SELECT cl.coop_id, CASE WHEN cb.p_id1 = cl.profile_number THEN cb.p_id2 ELSE cb.p_id1 END
            FROM changelog AS cl LEFT JOIN coop_bundled AS cb ON cb.id = cl.coop_id WHERE cl.id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&mut **tx)
    .await?;
    let (coop_id, partner) = current.unwrap_or((None, None));
    if partner.as_deref().is_some_and(|p| p != FILLER) {
        return Ok(());
    }
    if let Some(t) = when {
        let candidates: Vec<String> = sqlx::query_scalar(
            r#"
                SELECT DISTINCT cl.profile_number FROM changelog AS cl LEFT JOIN coop_bundled AS cb ON cb.id = cl.coop_id
                WHERE cl.map_id = $1 AND cl.score = $2 AND cl.profile_number NOT IN ($3, $4) AND NOT cl.banned AND cl.mirror_of IS NULL
                  AND cl.timestamp BETWEEN $5 - make_interval(hours => $6) AND $5 + make_interval(hours => $6)
                  AND (cl.coop_id IS NULL OR cb.p_id1 = $4 OR cb.p_id2 = $4 OR cb.p_id2 IS NULL)
            "#,
        )
        .bind(&map.steam_id)
        .bind(score)
        .bind(profile)
        .bind(FILLER)
        .bind(t)
        .bind(COOP_WINDOW_HOURS as i32)
        .fetch_all(&mut **tx)
        .await?;
        if let [partner] = candidates.as_slice() {
            if let Err(refused) = moderation::pair_partner(tx, id, partner).await? {
                log::debug!("old-board sync: pairing {id} with {partner}: {refused:?}");
            } else {
                return Ok(());
            }
        }
    }
    if coop_id.is_none() {
        let filler: Option<i64> = sqlx::query_scalar("SELECT id FROM changelog WHERE profile_number = $1 AND map_id = $2 ORDER BY id LIMIT 1")
            .bind(FILLER)
            .bind(&map.steam_id)
            .fetch_optional(&mut **tx)
            .await?;
        if let Some(filler) = filler {
            moderation::pair_with_filler(tx, id, profile, filler).await?;
        }
    }
    Ok(())
}

/// Downloads the old board's demo for a run into the demo storage and attaches it.
async fn attach_demo(pool: &PgPool, config: &Config, client: &reqwest::Client, url: &str, legacy_id: i64, cl_id: i64) -> Result<(), String> {
    let name = download_demo(config, client, url, legacy_id).await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let demo_id: i64 = sqlx::query_scalar("INSERT INTO demos (file_id, parsed_successfully, cl_id) VALUES ($1, false, $2) RETURNING id")
        .bind(&name)
        .bind(cl_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("UPDATE changelog SET demo_id = $2 WHERE id = $1 AND demo_id IS NULL").bind(cl_id).bind(demo_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())
}

/// Saves the old board's demo for a run in the demo storage; returns the file name.
async fn download_demo(config: &Config, client: &reqwest::Client, url: &str, legacy_id: i64) -> Result<String, String> {
    let dir = config.demo.storage.as_deref().filter(|d| !d.is_empty()).ok_or("no demo storage (DEMO.STORAGE)")?;
    let res = client.get(format!("{url}/getDemo?id={legacy_id}")).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    // The file's own name (Map_score_steamid_id.dem), as in the demo archive.
    let name = res.url().path().rsplit('/').next().map(|n| sanitize_filename::sanitize(n)).filter(|n| n.to_ascii_lowercase().ends_with(".dem")).unwrap_or_else(|| format!("{legacy_id}.dem"));
    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    // The old board answers this (with a 200) when the file is gone.
    if bytes.starts_with(b"Demo URL cannot be resolved") {
        return Err(GONE.into());
    }
    if bytes.len() > MAX_DEMO_BYTES || bytes.len() < 1072 || &bytes[..8] != b"HL2DEMO\0" {
        return Err("not a demo".into());
    }
    tokio::fs::create_dir_all(dir).await.map_err(|e| e.to_string())?;
    tokio::fs::write(Path::new(dir).join(&name), &bytes).await.map_err(|e| e.to_string())?;
    Ok(name)
}

/// Hides the Steam sync's runs the old board doesn't have, once its newest entry is well past
/// them (so its own fetcher has had its chance).
#[allow(clippy::too_many_arguments)]
async fn hide_missing(
    pool: &PgPool,
    game_id: i32,
    since: NaiveDateTime,
    entries: &[Entry],
    accounted: &HashSet<i64>,
    dry_run: bool,
    report: &mut BoardReport,
    touched: &mut HashSet<(String, bool)>,
) -> Result<(), sqlx::Error> {
    let Some(newest) = entries.iter().filter_map(Entry::when).max() else {
        return Ok(());
    };
    let rows: Vec<(i64, String, String, i32, NaiveDateTime, bool)> = sqlx::query_as(
        r#"
            SELECT cl.id, cl.profile_number, m.name, cl.score, cl.timestamp, c.is_multiplayer
            FROM changelog AS cl JOIN maps AS m ON m.steam_id = cl.map_id JOIN chapters AS c ON c.id = m.chapter_id
            WHERE c.game_id = $1 AND cl.submission = 0 AND cl.mirror_of IS NULL AND cl.profile_number <> $2 AND NOT cl.banned
              AND NOT EXISTS (SELECT 1 FROM legacy_changelog_ids AS l WHERE l.changelog_id = cl.id)
              AND cl.timestamp >= $3 AND cl.timestamp <= $4
            ORDER BY cl.timestamp
        "#,
    )
    .bind(game_id)
    .bind(FILLER)
    .bind(since + Span::hours(1))
    .bind((newest - Span::minutes(MISSING_AFTER_MINUTES)).min(Utc::now().naive_utc() - Span::hours(HIDE_AFTER_HOURS)))
    .fetch_all(pool)
    .await?;
    for (id, profile, map_name, score, timestamp, _) in rows.iter().filter(|r| !accounted.contains(&r.0)) {
        report.hidden += 1;
        report.note(format!("hide: run {id} ({profile} {} on {map_name}, {timestamp}) isn't on the old board", crate::controllers::submissions::format_time(*score)));
        if dry_run {
            continue;
        }
        let mut tx = pool.begin().await?;
        let map: (String, bool) = sqlx::query_as(
            "UPDATE changelog AS cl SET banned = true, admin_note = $2 FROM maps AS m JOIN chapters AS c ON c.id = m.chapter_id WHERE cl.id = $1 AND m.steam_id = cl.map_id RETURNING cl.map_id, c.is_multiplayer",
        )
        .bind(id)
        .bind(HIDDEN_REASON)
        .fetch_one(&mut *tx)
        .await?;
        moderation::log_action(&mut tx, &AdminOrService::Service, "run.ban", "run", &id.to_string(), Some(HIDDEN_REASON), json!({ "changelog_ids": [id] })).await?;
        tx.commit().await?;
        touched.insert(map);
    }
    Ok(())
}

/// A Steam copy to delete: id, player, map name, score, set at, the old board's time, and its
/// co-op partner's half (if any).
type Duplicate = (i64, String, String, i32, NaiveDateTime, i32, Vec<i64>);

/// Deletes the Steam sync's runs the old board will never list because it already had an equal or
/// better time by the same player on the map (in the map's category) before Steam showed this one,
/// and the ones the first version of this rule hid. A co-op run goes only when its partner's half
/// is such a copy too, as deleting one deletes both.
pub(crate) async fn delete_duplicates(
    pool: &PgPool,
    game_id: i32,
    since: NaiveDateTime,
    accounted: &HashSet<i64>,
    dry_run: bool,
    report: &mut BoardReport,
    touched: &mut HashSet<(String, bool)>,
) -> Result<(), sqlx::Error> {
    let rows: Vec<Duplicate> = sqlx::query_as(
        r#"
            SELECT cl.id, cl.profile_number, m.name, cl.score, cl.timestamp,
                   (SELECT min(o.score) FROM changelog AS o JOIN legacy_changelog_ids AS l ON l.changelog_id = o.id AND l.game_id = $1
                    WHERE o.profile_number = cl.profile_number AND o.map_id = cl.map_id AND o.category_id = cl.category_id
                      AND NOT o.banned AND o.score <= cl.score AND o.timestamp <= cl.timestamp),
                   ARRAY(SELECT x.id FROM coop_bundled AS cb JOIN changelog AS x ON x.id IN (cb.cl_id1, cb.cl_id2)
                         WHERE cb.id = cl.coop_id AND x.id <> cl.id AND x.profile_number <> $2)
            FROM changelog AS cl JOIN maps AS m ON m.steam_id = cl.map_id JOIN chapters AS c ON c.id = m.chapter_id
            WHERE c.game_id = $1 AND cl.submission = 0 AND cl.mirror_of IS NULL AND cl.profile_number <> $2
              AND ((NOT cl.banned AND cl.timestamp >= $3) OR (cl.banned AND cl.admin_note = $4))
              AND NOT EXISTS (SELECT 1 FROM legacy_changelog_ids AS l WHERE l.changelog_id = cl.id)
              AND EXISTS (SELECT 1 FROM changelog AS o JOIN legacy_changelog_ids AS l ON l.changelog_id = o.id AND l.game_id = $1
                          WHERE o.profile_number = cl.profile_number AND o.map_id = cl.map_id AND o.category_id = cl.category_id
                            AND NOT o.banned AND o.score <= cl.score AND o.timestamp <= cl.timestamp)
            ORDER BY cl.timestamp
        "#,
    )
    .bind(game_id)
    .bind(FILLER)
    .bind(since)
    .bind(SUPERSEDED_NOTE)
    .fetch_all(pool)
    .await?;
    let copies: HashSet<i64> = rows.iter().map(|r| r.0).filter(|id| !accounted.contains(id)).collect();
    let mut gone: HashSet<i64> = HashSet::new();
    for (id, profile, map_name, score, timestamp, theirs, partners) in rows.iter().filter(|r| copies.contains(&r.0)) {
        if !partners.iter().all(|p| copies.contains(p)) {
            continue;
        }
        report.deleted += 1;
        let time = crate::controllers::submissions::format_time;
        report.note(format!("delete: run {id} ({profile} {} on {map_name}, {timestamp}): the old board already had {}", time(*score), time(*theirs)));
        if dry_run || gone.contains(id) {
            continue;
        }
        match moderation::delete_run(pool, &AdminOrService::Service, *id, Some(DUPLICATE_REASON)).await? {
            Ok(done) => {
                gone.extend(done.ids);
                touched.insert((done.map_id, done.is_coop));
            }
            Err(_) => report.errors.push(format!("run {id}: couldn't delete it")),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::unescape_note;

    #[test]
    fn unescapes_notes() {
        assert_eq!(unescape_note("it&#039;s &quot;fine&quot; &amp; \\'ok\\'"), "it's \"fine\" & 'ok'");
    }
}
