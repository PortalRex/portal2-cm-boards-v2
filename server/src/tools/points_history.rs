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
    id: i64,
}

struct MapTimeline {
    map_id: String,
    mode: usize,
    /// (time, player index, score, run), oldest first. Both halves of a co-op run share the run.
    runs: Vec<(NaiveDateTime, u32, i32, i64)>,
    /// The changelog id of each run in `runs`.
    ids: Vec<i64>,
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
                COALESCE(cl.coop_id, -cl.id) AS run_key, cl.id
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
        let mi = *map_index.entry(r.map_id.clone()).or_insert(next);
        if mi == maps.len() {
            maps.push(MapTimeline { map_id: r.map_id, mode, runs: Vec::new(), ids: Vec::new() });
        }
        let next_player = players.len() as u32;
        let pi = *players.entry(r.profile_number).or_insert(next_player);
        maps[mi].runs.push((r.timestamp, pi, r.score, r.run_key));
        maps[mi].ids.push(r.id);
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

/// A player's best time on one map as of a moment, with its rank and points then.
#[derive(Debug, Serialize)]
pub struct MapStanding {
    pub map_id: String,
    pub score: i32,
    pub rank: u32,
    pub points: f64,
    pub changelog_id: i64,
    /// None for imported runs without a date.
    pub timestamp: Option<NaiveDateTime>,
}

/// A player's standing as of a moment: points and global place per board key (`sp`, `coop`, ...
/// and `overall`), and their best time on each map then.
#[derive(Debug, Serialize)]
pub struct ProfileAt {
    pub at: NaiveDateTime,
    pub points: BTreeMap<String, f64>,
    pub places: BTreeMap<String, u32>,
    pub maps: Vec<MapStanding>,
}

/// Where a player stood as of `at` (None when they have no runs in the game): every map's ranks
/// worked out against everyone's best times then, as the points boards rank them.
pub async fn profile_at(pool: &PgPool, game_id: i32, profile_number: &str, at: NaiveDateTime) -> Result<Option<ProfileAt>, sqlx::Error> {
    let t = timeline(pool, game_id).await?;
    let Some(&me) = t.players.get(profile_number) else {
        return Ok(None);
    };
    let (totals, mut maps) = standings(&t, at, Some(me));
    let modes = t.modes.len();
    let total_of = |p: usize, mode: Option<usize>| -> f64 {
        match mode {
            Some(m) => totals[p * modes + m],
            None => totals[p * modes..(p + 1) * modes].iter().sum(),
        }
    };
    let mine = me as usize;
    let mut points = BTreeMap::new();
    let mut places = BTreeMap::new();
    for (key, mode) in board_keys(&t) {
        let my = total_of(mine, mode);
        points.insert(key.clone(), (my * 10.0).round() / 10.0);
        if my > 0.0 {
            let ahead = (0..t.players.len()).filter(|&p| total_of(p, mode) > my).count() as u32;
            places.insert(key, ahead + 1);
        }
    }
    maps.sort_by(|a, b| a.map_id.cmp(&b.map_id));
    Ok(Some(ProfileAt { at, points, places, maps }))
}

/// The board keys of a game (its modes, then `overall`), each with its mode index (None = all).
fn board_keys(t: &Timeline) -> Vec<(String, Option<usize>)> {
    t.modes.iter().cloned().enumerate().map(|(i, m)| (m, Some(i))).chain(std::iter::once(("overall".to_string(), None))).collect()
}

/// Everyone's points per mode as of `at` (player-major: `[player * modes + mode]`), and, for `me`,
/// their best time on each map then.
fn standings(t: &Timeline, at: NaiveDateTime, me: Option<u32>) -> (Vec<f64>, Vec<MapStanding>) {
    let release = NaiveDate::from_ymd_opt(2011, 4, 19).unwrap().and_hms_opt(0, 0, 0).unwrap();
    let by_run = crate::tools::config::coop_by_run();
    let modes = t.modes.len();
    let mut totals = vec![0.0f64; t.players.len() * modes];
    let mut maps = Vec::new();
    for map in &t.maps {
        // Each player's best as of `at`: (score, run, index in `runs`).
        let mut best: HashMap<u32, (i32, i64, usize)> = HashMap::new();
        for (i, &(ts, p, s, run)) in map.runs.iter().enumerate() {
            if ts > at {
                break;
            }
            if best.get(&p).map_or(true, |&(old, _, _)| s < old) {
                best.insert(p, (s, run, i));
            }
        }
        // Entries per time (players, or distinct runs when co-op ranks by run).
        let mut counts: BTreeMap<i32, u32> = BTreeMap::new();
        let mut runs_seen = std::collections::HashSet::new();
        for &(s, run, _) in best.values() {
            if !by_run || runs_seen.insert(run) {
                *counts.entry(s).or_insert(0) += 1;
            }
        }
        for (&p, &(s, _, i)) in &best {
            let rank = counts.range(..s).map(|(_, c)| *c).sum::<u32>() + 1;
            let points = score(rank as i32) as f64;
            totals[p as usize * modes + map.mode] += points;
            if Some(p) == me {
                let ts = map.runs[i].0;
                maps.push(MapStanding { map_id: map.map_id.clone(), score: s, rank, points, changelog_id: map.ids[i], timestamp: (ts != release).then_some(ts) });
            }
        }
    }
    (totals, maps)
}

/// Legends' points thresholds (Portal 2), as in the role manager's official list
/// (frontend/src/data/roles.js); any one of them is enough.
const LEGENDS: [(&str, f64); 3] = [("sp", 11700.0), ("coop", 9450.0), ("overall", 21000.0)];

/// Records on the player when their peak reached Legends (the earliest qualifying peak's day).
async fn record_legends(pool: &PgPool, game_id: i32, profile_number: &str, peaks: &BTreeMap<String, Peak>) -> Result<(), sqlx::Error> {
    if game_id != 1 {
        return Ok(());
    }
    let reached = LEGENDS.iter().filter_map(|(key, min)| peaks.get(*key).filter(|p| p.points >= *min).map(|p| p.date)).min();
    if let Some(day) = reached {
        sqlx::query("UPDATE users SET legends_at = $2 WHERE profile_number = $1 AND (legends_at IS NULL OR legends_at > $2)")
            .bind(profile_number)
            .bind(day.and_hms_opt(0, 0, 0))
            .execute(pool)
            .await?;
    }
    Ok(())
}

/// In the background after startup, works out the peak of every player who could have reached
/// Legends (at least three quarters of a threshold now: points only drop after a peak as others
/// pass), so their profile shows Legends at once rather than after the peak is worked out.
pub fn start_legends_check(pool: PgPool) {
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(90)).await;
        let candidates = match legends_candidates(&pool).await {
            Ok(c) => c,
            Err(e) => {
                log::error!("legends check: {e}");
                return;
            }
        };
        let mut found = 0;
        for profile in &candidates {
            match points_peak(&pool, 1, profile).await {
                Ok(peaks) => found += usize::from(LEGENDS.iter().any(|(k, min)| peaks.get(*k).is_some_and(|p| p.points >= *min))),
                Err(e) => log::warn!("legends check {profile}: {e}"),
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
        log::info!("legends check: {} candidates, {found} reached Legends at their peak", candidates.len());
    });
}

async fn legends_candidates(pool: &PgPool) -> Result<Vec<String>, sqlx::Error> {
    let t = timeline(pool, 1).await?;
    let (totals, _) = standings(&t, Utc::now().naive_utc(), None);
    let modes = t.modes.len();
    let mut names = vec![String::new(); t.players.len()];
    for (name, &i) in &t.players {
        names[i as usize] = name.clone();
    }
    let keys = board_keys(&t);
    Ok((0..t.players.len())
        .filter(|&p| {
            keys.iter().any(|(key, mode)| {
                let total = match mode {
                    Some(m) => totals[p * modes + m],
                    None => totals[p * modes..(p + 1) * modes].iter().sum(),
                };
                LEGENDS.iter().any(|(k, min)| k == key && total >= min * 0.75)
            })
        })
        .map(|p| names[p].clone())
        .collect())
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
    record_legends(pool, game_id, profile_number, &result).await?;
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
