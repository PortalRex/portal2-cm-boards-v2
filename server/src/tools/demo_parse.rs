//! Reads every demo the boards have (`server/demo-parser/parse_batch.mjs`) and stores what's in it:
//! the scoreboard time and portal count, the players, who hosted a co-op run, the SAR version and
//! build checksum, SAR's split times and its record of pauses and timescale cheats.
//!
//! A demo is read once (`demos.parsed_at`): new submissions, demos pulled from the old boards and
//! demos whose file was restored are picked up as they come, and the existing archive is worked
//! through in batches. From what's read, a run gets:
//! - its portal count and split times, when the demo's scoreboard time is the run's time (so a
//!   demo filed under the wrong run can't attach its numbers);
//! - for co-op, the partner the demo shows, when the run was paired with the placeholder partner,
//!   and who hosted, when that wasn't known;
//! - `demos.partner_name`, and `demos.sar_version`: SAR echoes its version into newer demos; an
//!   older demo gets the version another demo with the same SAR build (checksum) echoed.
//!
//! On by default when the parser is set up (`DEMO.PARSER`); `DEMO.AUTO_PARSE=false` turns it off.
use crate::{
    controllers::moderation::{self, FILLER},
    tools::{cache::CacheState, config::Config, demo_files, points_cache, steam_sync},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use std::{collections::HashSet, path::Path, time::Duration};

/// Demos per run of the parser.
const BATCH: i64 = 500;
/// Wait between batches once everything is read.
const IDLE: Duration = Duration::from_secs(10 * 60);

/// What one batch did.
#[derive(Debug, Default, Serialize, Clone)]
pub struct ParseReport {
    pub picked: usize,
    pub parsed: usize,
    pub failed: usize,
    pub missing_file: usize,
    pub portals_set: u64,
    pub segments_set: u64,
    pub partners_set: usize,
    pub hosts_set: u64,
    pub versions_named: u64,
    /// Demos still to read after this batch.
    pub remaining: i64,
}

#[derive(Debug, Deserialize)]
struct Player {
    #[serde(rename = "steamId")]
    steam_id: String,
    name: Option<String>,
}

/// One line of parse_batch.mjs output.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Parsed {
    id: i64,
    ok: bool,
    error: Option<String>,
    time_score: Option<i32>,
    portal_score: Option<i32>,
    #[serde(default)]
    players: Vec<Player>,
    host_steam_id: Option<String>,
    sar_version: Option<String>,
    sar_checksum: Option<String>,
    sar_approved: Option<bool>,
    segments: Option<Value>,
    checks: Option<Value>,
}

#[derive(Debug, sqlx::FromRow)]
struct Pending {
    demo_id: i64,
    file_id: String,
    cl_id: i64,
    score: i32,
    profile_number: String,
    map_id: String,
    is_coop: bool,
    no_segments: bool,
}

/// One batch at a time (the background job and the staff endpoint share it).
static RUNNING: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Starts the background job (no-op without the parser or with `DEMO.AUTO_PARSE=false`).
pub fn start(pool: PgPool, config: Config, cache: CacheState) {
    if !config.demo.auto_parse() {
        log::info!("demo parsing: off (DEMO.PARSER / DEMO.AUTO_PARSE)");
        return;
    }
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(60)).await;
        loop {
            match crate::tools::jobs::track(crate::tools::jobs::DEMO_PARSE, "schedule", false, summary, run_batch(&pool, &config, &cache, BATCH, None)).await {
                Ok(r) if r.picked > 0 => {
                    log::info!(
                        "demo parsing: {} read ({} failed, {} files missing), {} portal counts, {} split times, {} partners, {} hosts, {} versions named; {} to go",
                        r.parsed, r.failed, r.missing_file, r.portals_set, r.segments_set, r.partners_set, r.hosts_set, r.versions_named, r.remaining
                    );
                    if r.parsed == 0 && r.missing_file == 0 {
                        // Nothing could be read this time (the parser failing?): don't spin.
                        tokio::time::sleep(IDLE).await;
                    }
                }
                Ok(_) => tokio::time::sleep(IDLE).await,
                Err(e) => {
                    log::error!("demo parsing failed: {e}");
                    tokio::time::sleep(IDLE).await;
                }
            }
        }
    });
}

/// What a batch did, in one line (admin page).
pub fn summary(r: &ParseReport) -> String {
    format!(
        "{} demos read ({} failed, {} files missing), {} partners and {} hosts filled in; {} waiting",
        r.parsed, r.failed, r.missing_file, r.partners_set, r.hosts_set, r.remaining
    )
}

/// Reads up to `limit` demos that haven't been read yet, newest first; or, with `runs`, those
/// runs' demos (read again).
pub async fn run_batch(pool: &PgPool, config: &Config, cache: &CacheState, limit: i64, runs: Option<&[i64]>) -> Result<ParseReport, sqlx::Error> {
    let _guard = RUNNING.lock().await;
    let mut report = ParseReport::default();
    let Some(script) = batch_script(config) else {
        return Ok(report);
    };
    let rows: Vec<Pending> = sqlx::query_as(
        r#"
            WITH demo_runs AS (
                SELECT d.id, d.file_id, c.id AS cl_id FROM demos AS d JOIN changelog AS c ON c.demo_id = d.id
                WHERE CASE WHEN $2::bigint[] IS NULL THEN d.parsed_at IS NULL ELSE c.id = ANY($2) END
                UNION ALL
                -- A co-op partner's demo of a run that wasn't a personal best for them: it's of
                -- the run its row points to.
                SELECT d.id, d.file_id, d.cl_id FROM coop_bundled AS cb JOIN demos AS d ON d.id = cb.partner_demo_id
                WHERE CASE WHEN $2::bigint[] IS NULL THEN d.parsed_at IS NULL ELSE d.cl_id = ANY($2) END
            )
            SELECT DISTINCT ON (dr.id) dr.id AS demo_id, dr.file_id, c.id AS cl_id, c.score, c.profile_number, c.map_id,
                ch.is_multiplayer AS is_coop, c.segments IS NULL AS no_segments
            FROM demo_runs AS dr
                JOIN changelog AS c ON c.id = dr.cl_id
                JOIN maps AS m ON m.steam_id = c.map_id
                JOIN chapters AS ch ON ch.id = m.chapter_id
            ORDER BY dr.id DESC, c.mirror_of NULLS FIRST, c.id
            LIMIT $1
        "#,
    )
    .bind(limit)
    .bind(runs)
    .fetch_all(pool)
    .await?;
    report.picked = rows.len();
    if rows.is_empty() {
        return Ok(report);
    }

    // The files; a demo whose file can't be found is marked so it isn't tried every batch.
    let mut list = String::new();
    for r in &rows {
        match demo_files::locate(&config.demo, &r.file_id, Some(r.cl_id)).await {
            Some(path) => list.push_str(&format!("{}\t{}\n", r.demo_id, path.display())),
            None => {
                sqlx::query("UPDATE demos SET parsed_at = now() AT TIME ZONE 'utc', parse_error = 'file not found' WHERE id = $1")
                    .bind(r.demo_id)
                    .execute(pool)
                    .await?;
                report.missing_file += 1;
            }
        }
    }
    let results = if list.is_empty() { Vec::new() } else { parse(config, &script, &list, rows.len()).await };

    let mut touched: HashSet<(String, bool)> = HashSet::new();
    for res in results {
        let Some(run) = rows.iter().find(|r| r.demo_id == res.id) else { continue };
        match apply(pool, config, run, &res, &mut report).await {
            Ok(changed_pairing) => {
                if changed_pairing {
                    touched.insert((run.map_id.clone(), run.is_coop));
                }
            }
            Err(e) => log::error!("demo parsing: demo {}: {e}", res.id),
        }
    }

    // Name the builds of demos too old to echo SAR's version, from demos of the same build that did.
    report.versions_named = sqlx::query(
        r#"
            UPDATE demos AS d SET sar_version = k.sar_version
            FROM (SELECT DISTINCT ON (sar_checksum) sar_checksum, sar_version FROM demos
                  WHERE sar_checksum IS NOT NULL AND sar_version IS NOT NULL ORDER BY sar_checksum, id DESC) AS k
            WHERE d.sar_version IS NULL AND d.sar_checksum = k.sar_checksum
        "#,
    )
    .execute(pool)
    .await?
    .rows_affected();

    if !touched.is_empty() {
        for (map_id, is_coop) in &touched {
            if cache.default_cat_ids.contains_key(map_id) {
                cache.reload_rank(pool, map_id, config, *is_coop).await;
            }
        }
        cache.update_current_states(&[crate::tools::cache::SP_PREVIEWS, crate::tools::cache::COOP_PREVIEWS], &[false, false]).await;
        points_cache::invalidate_points().await;
    }
    report.remaining = sqlx::query_scalar("SELECT COUNT(*) FROM demos WHERE parsed_at IS NULL").fetch_one(pool).await?;
    Ok(report)
}

/// Whether demos can be read on this server (the parser is set up).
pub fn available(config: &Config) -> bool {
    batch_script(config).is_some()
}

/// parse_batch.mjs, next to the single-demo parser (`DEMO.PARSER`).
fn batch_script(config: &Config) -> Option<String> {
    let parser = config.demo.parser.as_deref().filter(|p| !p.is_empty())?;
    let script = Path::new(parser).parent()?.join("parse_batch.mjs");
    script.exists().then(|| script.display().to_string())
}

/// Runs the batch parser over `list` ("id<TAB>path" lines) and collects its results.
async fn parse(config: &Config, script: &str, list: &str, count: usize) -> Vec<Parsed> {
    let file = std::env::temp_dir().join(format!("p2boards-demos-{}.txt", &crate::tools::auth::random_token()[..12]));
    if let Err(e) = tokio::fs::write(&file, list).await {
        log::error!("demo parsing: {e}");
        return Vec::new();
    }
    let node = config.demo.node.as_deref().filter(|n| !n.is_empty()).unwrap_or("node");
    let mut command = tokio::process::Command::new(node);
    command.arg(script).arg(&file).arg(config.demo.parse_workers().to_string()).kill_on_drop(true);
    // Idle priority: only spare CPU goes to reading demos.
    #[cfg(windows)]
    command.creation_flags(0x0000_0040); // IDLE_PRIORITY_CLASS
    let run = command.output();
    // Generous: a few seconds a demo even on one core.
    let output = tokio::time::timeout(Duration::from_secs(60 + 3 * count as u64), run).await;
    let _ = tokio::fs::remove_file(&file).await;
    let output = match output {
        Ok(Ok(o)) => o,
        Ok(Err(e)) => {
            log::error!("demo parsing: the parser didn't start: {e}");
            return Vec::new();
        }
        Err(_) => {
            log::error!("demo parsing: the parser timed out");
            return Vec::new();
        }
    };
    if !output.stderr.is_empty() {
        log::warn!("demo parsing: {}", String::from_utf8_lossy(&output.stderr).trim());
    }
    String::from_utf8_lossy(&output.stdout).lines().filter_map(|l| serde_json::from_str::<Parsed>(l).ok()).collect()
}

/// Stores one demo's results and fills its run in. Returns whether the run's co-op pairing changed.
async fn apply(pool: &PgPool, config: &Config, run: &Pending, res: &Parsed, report: &mut ParseReport) -> Result<bool, sqlx::Error> {
    if res.ok {
        report.parsed += 1;
    } else {
        report.failed += 1;
    }
    // The run's own time: the demo is this run's.
    let matches = res.ok && res.time_score == Some(run.score);
    // The partner the demo shows: the one other player, when the run's player is in it.
    let partner = (run.is_coop && res.players.len() == 2 && res.players.iter().any(|p| p.steam_id == run.profile_number))
        .then(|| res.players.iter().find(|p| p.steam_id != run.profile_number))
        .flatten();
    let players = serde_json::to_value(res.players.iter().map(|p| serde_json::json!({ "steamId": p.steam_id, "name": p.name })).collect::<Vec<_>>()).ok();

    // A partner without an account gets one first (outside the transaction: it calls Steam).
    let mut pair_with: Option<&str> = None;
    if matches {
        if let Some(p) = partner {
            let current: Option<Option<String>> = sqlx::query_scalar(
                "SELECT CASE WHEN cb.p_id1 = cl.profile_number THEN cb.p_id2 ELSE cb.p_id1 END FROM changelog AS cl JOIN coop_bundled AS cb ON cb.id = cl.coop_id WHERE cl.id = $1",
            )
            .bind(run.cl_id)
            .fetch_optional(pool)
            .await?;
            if matches!(current, Some(Some(ref c)) if c == FILLER) || matches!(current, Some(None)) {
                steam_sync::ensure_user(pool, config, &p.steam_id).await?;
                pair_with = Some(p.steam_id.as_str());
            }
        }
    }

    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
            UPDATE demos SET parsed_at = now() AT TIME ZONE 'utc', parsed_successfully = $2, parse_error = $3,
                time_score = $4, portal_score = $5, players = $6, host_steam_id = $7,
                sar_version = COALESCE($8, sar_version), sar_checksum = $9, sar_approved = $10, sar_checks = $11,
                partner_name = COALESCE(partner_name, $12)
            WHERE id = $1
        "#,
    )
    .bind(res.id)
    .bind(res.ok)
    .bind(res.error.as_deref().map(|e| e.chars().take(200).collect::<String>()))
    .bind(res.time_score)
    .bind(res.portal_score)
    .bind(players)
    .bind(res.host_steam_id.as_deref())
    .bind(res.sar_version.as_deref().map(|v| v.chars().take(50).collect::<String>()))
    .bind(res.sar_checksum.as_deref())
    .bind(res.sar_approved)
    .bind(&res.checks)
    .bind(partner.and_then(|p| p.name.as_deref()).map(|n| n.chars().take(50).collect::<String>()))
    .execute(&mut *tx)
    .await?;

    let mut changed_pairing = false;
    if matches {
        if let Some(portals) = res.portal_score.filter(|p| (0..=i16::MAX as i32).contains(p)) {
            report.portals_set += sqlx::query("UPDATE changelog SET portals = $2 WHERE (id = $1 OR mirror_of = $1) AND portals IS NULL")
                .bind(run.cl_id)
                .bind(portals as i16)
                .execute(&mut *tx)
                .await?
                .rows_affected();
        }
        if run.no_segments {
            if let Some(segments) = res.segments.as_ref().filter(|s| s.as_array().is_some_and(|a| !a.is_empty())) {
                report.segments_set += sqlx::query("UPDATE changelog SET segments = $2 WHERE id = $1 AND segments IS NULL")
                    .bind(run.cl_id)
                    .bind(segments)
                    .execute(&mut *tx)
                    .await?
                    .rows_affected();
            }
        }
        if let Some(p) = pair_with {
            match moderation::pair_partner(&mut tx, run.cl_id, p).await? {
                Ok(_) => {
                    report.partners_set += 1;
                    changed_pairing = true;
                }
                Err(refused) => log::debug!("demo parsing: pairing run {} with {p}: {refused:?}", run.cl_id),
            }
        }
        if let Some(host) = res.host_steam_id.as_deref() {
            report.hosts_set += sqlx::query(
                r#"
                    UPDATE coop_bundled SET p1_is_host = (p_id1 = $2)
                    WHERE id = (SELECT coop_id FROM changelog WHERE id = $1) AND p1_is_host IS NULL AND $2 IN (p_id1, p_id2)
                "#,
            )
            .bind(run.cl_id)
            .bind(host)
            .execute(&mut *tx)
            .await?
            .rows_affected();
        }
    }
    tx.commit().await?;
    Ok(changed_pairing)
}
