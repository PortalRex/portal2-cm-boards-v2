//! A player's points over time, as they actually were: at each sample date, every map's rank
//! is worked out against everyone's best time as of that date (so being passed lowers it),
//! using the same rules as the points boards (verified, unbanned runs in the map's main
//! category; ties share a rank; co-op by run or by player as set by
//! [crate::tools::config::coop_by_run]; points from [crate::tools::helpers::score]).
//!
//! Each game's run timeline (every qualifying run, in time order per map) is read once and
//! kept in memory; it's dropped with the points cache whenever runs change.
use crate::tools::helpers::score;
use chrono::{Duration as ChronoDuration, NaiveDate, NaiveDateTime, Utc};
use sqlx::{FromRow, PgPool};
use std::{
    collections::{BTreeMap, HashMap},
    sync::{Arc, OnceLock},
};
use tokio::sync::Mutex;

/// Most points per chart (the sample interval widens for long careers).
const MAX_SAMPLES: i64 = 160;

#[derive(FromRow)]
struct RunRow {
    map_id: String,
    game_mode: String,
    profile_number: String,
    score: i32,
    timestamp: NaiveDateTime,
    run_key: i64,
}

struct MapTimeline {
    mode: usize,
    /// (time, player index, score, run), oldest first. Both halves of a co-op run share the run.
    runs: Vec<(NaiveDateTime, u32, i32, i64)>,
}

struct Timeline {
    modes: Vec<String>,
    players: HashMap<String, u32>,
    maps: Vec<MapTimeline>,
}

/// Cached answers per (game, player, day): both only change with the timeline, which is
/// cleared whenever runs change, or with the date.
#[derive(Default)]
struct HistoryCache {
    games: Mutex<HashMap<i32, Arc<Timeline>>>,
    histories: Mutex<HashMap<(i32, String, NaiveDate), Arc<Vec<HistoryPoint>>>>,
    peaks: Mutex<HashMap<(i32, String, NaiveDate), Arc<BTreeMap<String, Peak>>>>,
}

/// Results kept per table before it's emptied (a few hundred bytes to a few KB each).
const MAX_CACHED_RESULTS: usize = 5000;

static CACHE: OnceLock<HistoryCache> = OnceLock::new();

fn cache() -> &'static HistoryCache {
    CACHE.get_or_init(HistoryCache::default)
}

/// Drops every game's timeline (called with [crate::tools::points_cache::invalidate_points]).
pub async fn clear() {
    let c = cache();
    c.games.lock().await.clear();
    c.histories.lock().await.clear();
    c.peaks.lock().await.clear();
}

async fn timeline(pool: &PgPool, game_id: i32) -> Result<Arc<Timeline>, sqlx::Error> {
    if let Some(t) = cache().games.lock().await.get(&game_id) {
        return Ok(t.clone());
    }
    let rows = sqlx::query_as::<_, RunRow>(
        r#"
            -- About 40k imported runs have no date; they count from Portal 2's release, as the
            -- boards count them.
            SELECT cl.map_id, c.game_mode, cl.profile_number, cl.score,
                COALESCE(cl.timestamp, TIMESTAMP '2011-04-19 00:00:00') AS timestamp,
                COALESCE(cl.coop_id, -cl.id) AS run_key
            FROM changelog AS cl
                JOIN users AS u ON u.profile_number = cl.profile_number
                JOIN maps AS m ON m.steam_id = cl.map_id
                JOIN chapters AS c ON c.id = m.chapter_id
            WHERE c.game_id = $1 AND cl.verified AND NOT cl.banned AND NOT u.banned
              AND cl.category_id = m.default_cat_id AND cl.profile_number <> 'N/A'
              -- A co-op run counts once both halves are verified and neither half nor player is banned
              -- (as on the co-op map page).
              AND NOT EXISTS (
                  SELECT 1 FROM coop_bundled AS cb
                      JOIN changelog AS o ON o.id IN (cb.cl_id1, cb.cl_id2) AND o.id <> cl.id
                      JOIN users AS ou ON ou.profile_number = o.profile_number
                  WHERE cb.id = cl.coop_id AND (NOT o.verified OR o.banned OR ou.banned)
              )
            ORDER BY 5, cl.id
        "#,
    )
    .bind(game_id)
    .fetch_all(pool)
    .await?;
    let mut modes: Vec<String> = Vec::new();
    let mut map_index: HashMap<String, usize> = HashMap::new();
    let mut players: HashMap<String, u32> = HashMap::new();
    let mut maps: Vec<MapTimeline> = Vec::new();
    for r in rows {
        let mode = match modes.iter().position(|m| *m == r.game_mode) {
            Some(i) => i,
            None => {
                modes.push(r.game_mode.clone());
                modes.len() - 1
            }
        };
        let next = maps.len();
        let mi = *map_index.entry(r.map_id).or_insert(next);
        if mi == maps.len() {
            maps.push(MapTimeline { mode, runs: Vec::new() });
        }
        let next_player = players.len() as u32;
        let pi = *players.entry(r.profile_number).or_insert(next_player);
        maps[mi].runs.push((r.timestamp, pi, r.score, r.run_key));
    }
    let t = Arc::new(Timeline { modes, players, maps });
    cache().games.lock().await.insert(game_id, t.clone());
    Ok(t)
}

/// The player's points per mode (in `t.modes` order) at each instant of `ends` (oldest first).
fn totals_at(t: &Timeline, me: u32, ends: &[NaiveDateTime]) -> Vec<Vec<f64>> {
    let by_run = crate::tools::config::coop_by_run();
    let mut totals = vec![vec![0.0f64; t.modes.len()]; ends.len()];
    for map in &t.maps {
        if !map.runs.iter().any(|r| r.1 == me) {
            continue;
        }
        // Sweep the map's runs in time order, keeping each player's best and a count of bests
        // per time (players, or distinct runs when co-op ranks by run), and read the player's
        // rank at each sample date.
        let mut best: HashMap<u32, (i32, i64)> = HashMap::new();
        let mut run_refs: HashMap<i64, u32> = HashMap::new();
        let mut counts: BTreeMap<i32, u32> = BTreeMap::new();
        let mut i = 0;
        for (si, end) in ends.iter().enumerate() {
            while i < map.runs.len() && map.runs[i].0 <= *end {
                let (_, p, s, run) = map.runs[i];
                match best.get(&p) {
                    Some(&(old, _)) if old <= s => {}
                    old => {
                        if let Some(&(o, orun)) = old {
                            let gone = if by_run {
                                let refs = run_refs.entry(orun).or_insert(1);
                                *refs -= 1;
                                *refs == 0
                            } else {
                                true
                            };
                            if gone {
                                run_refs.remove(&orun);
                                if let Some(c) = counts.get_mut(&o) {
                                    *c -= 1;
                                    if *c == 0 {
                                        counts.remove(&o);
                                    }
                                }
                            }
                        }
                        best.insert(p, (s, run));
                        let new = if by_run {
                            let refs = run_refs.entry(run).or_insert(0);
                            *refs += 1;
                            *refs == 1
                        } else {
                            true
                        };
                        if new {
                            *counts.entry(s).or_insert(0) += 1;
                        }
                    }
                }
                i += 1;
            }
            if let Some(&(mine, _)) = best.get(&me) {
                let faster: u32 = counts.range(..mine).map(|(_, c)| *c).sum();
                totals[si][map.mode] += score(faster as i32 + 1) as f64;
            }
        }
    }
    totals
}

/// A player's highest points total, with when it was reached.
#[derive(Debug, Serialize)]
pub struct Peak {
    pub points: f64,
    pub date: NaiveDate,
}

/// A player's peak points per board key (`sp`, `coop`, ... and `overall`). Points only go up when
/// the player sets a run (others can only pass them), so the peak is at one of their own runs:
/// each is checked exactly. Undated runs count from release, as on the chart, but release itself
/// isn't a candidate (the chart doesn't start there either).
pub async fn points_peak(pool: &PgPool, game_id: i32, profile_number: &str) -> Result<Arc<BTreeMap<String, Peak>>, sqlx::Error> {
    let key = (game_id, profile_number.to_string(), Utc::now().date_naive());
    if let Some(hit) = cache().peaks.lock().await.get(&key) {
        return Ok(hit.clone());
    }
    let result = Arc::new(compute_peak(pool, game_id, profile_number).await?);
    let mut peaks = cache().peaks.lock().await;
    if peaks.len() >= MAX_CACHED_RESULTS {
        peaks.clear();
    }
    peaks.insert(key, result.clone());
    Ok(result)
}

async fn compute_peak(pool: &PgPool, game_id: i32, profile_number: &str) -> Result<BTreeMap<String, Peak>, sqlx::Error> {
    let t = timeline(pool, game_id).await?;
    let Some(&me) = t.players.get(profile_number) else {
        return Ok(BTreeMap::new());
    };
    let release = NaiveDate::from_ymd_opt(2011, 4, 19).unwrap().and_hms_opt(0, 0, 0).unwrap();
    let mut ends: Vec<NaiveDateTime> = t.maps.iter().flat_map(|m| m.runs.iter().filter(|r| r.1 == me && r.0 != release).map(|r| r.0)).collect();
    ends.sort();
    ends.dedup();
    if ends.is_empty() {
        ends.push(Utc::now().naive_utc());
    }
    let totals = totals_at(&t, me, &ends);
    let mut peaks: BTreeMap<String, Peak> = BTreeMap::new();
    let mut consider = |key: &str, value: f64, at: NaiveDateTime| {
        let value = (value * 10.0).round() / 10.0;
        let better = peaks.get(key).map_or(true, |p| value > p.points);
        if better && value > 0.0 {
            peaks.insert(key.to_string(), Peak { points: value, date: at.date() });
        }
    };
    for (at, per_mode) in ends.iter().zip(&totals) {
        for (mode, value) in t.modes.iter().zip(per_mode) {
            consider(mode, *value, *at);
        }
        consider("overall", per_mode.iter().sum(), *at);
    }
    Ok(peaks)
}

/// One chart point: the date and the player's points per board key (`sp`, `coop`, ...), with
/// `overall` their sum.
#[derive(Debug, Serialize)]
pub struct HistoryPoint {
    pub date: NaiveDate,
    #[serde(flatten)]
    pub points: BTreeMap<String, f64>,
}

/// A player's points over time in a game, from their first run to today.
pub async fn points_history(pool: &PgPool, game_id: i32, profile_number: &str) -> Result<Arc<Vec<HistoryPoint>>, sqlx::Error> {
    let key = (game_id, profile_number.to_string(), Utc::now().date_naive());
    if let Some(hit) = cache().histories.lock().await.get(&key) {
        return Ok(hit.clone());
    }
    let result = Arc::new(compute_history(pool, game_id, profile_number).await?);
    let mut histories = cache().histories.lock().await;
    if histories.len() >= MAX_CACHED_RESULTS {
        histories.clear();
    }
    histories.insert(key, result.clone());
    Ok(result)
}

async fn compute_history(pool: &PgPool, game_id: i32, profile_number: &str) -> Result<Vec<HistoryPoint>, sqlx::Error> {
    let t = timeline(pool, game_id).await?;
    let Some(&me) = t.players.get(profile_number) else {
        return Ok(Vec::new());
    };
    // Undated runs count from release (so today's total matches the boards), but the chart
    // starts at the player's first dated run, not at release with points they likely got later.
    let release = NaiveDate::from_ymd_opt(2011, 4, 19).unwrap().and_hms_opt(0, 0, 0).unwrap();
    let mine = || t.maps.iter().flat_map(|m| m.runs.iter().filter(|r| r.1 == me).map(|r| r.0));
    let Some(any) = mine().min() else {
        return Ok(Vec::new());
    };
    let first = mine().filter(|ts| *ts != release).min().unwrap_or(any);
    // Sample dates: from the first run to today, at least weekly, at most MAX_SAMPLES of them.
    let start = first.date();
    let today = Utc::now().date_naive();
    let span = (today - start).num_days().max(1);
    let step = (span / MAX_SAMPLES).max(7);
    let mut dates: Vec<NaiveDate> = (0..=span / step).map(|i| start + ChronoDuration::days(i * step)).collect();
    if dates.last() != Some(&today) {
        dates.push(today);
    }
    let ends: Vec<NaiveDateTime> = dates.iter().map(|d| d.and_hms_opt(23, 59, 59).unwrap()).collect();

    let totals = totals_at(&t, me, &ends);
    Ok(dates
        .into_iter()
        .zip(totals)
        .map(|(date, per_mode)| {
            let mut points: BTreeMap<String, f64> = t.modes.iter().cloned().zip(per_mode.iter().map(|p| (p * 10.0).round() / 10.0)).collect();
            let overall: f64 = per_mode.iter().sum();
            points.insert("overall".into(), (overall * 10.0).round() / 10.0);
            HistoryPoint { date, points }
        })
        .collect())
}
