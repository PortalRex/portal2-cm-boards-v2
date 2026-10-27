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
use serde::Serialize;
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
    chapter_id: i32,
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
    /// Index in [Timeline::chapters].
    chapter: usize,
    /// (time, player index, score, run), oldest first. Both halves of a co-op run share the run.
    runs: Vec<(NaiveDateTime, u32, i32, i64)>,
    /// The changelog id of each run in `runs`.
    ids: Vec<i64>,
}

struct Timeline {
    modes: Vec<String>,
    players: HashMap<String, u32>,
    maps: Vec<MapTimeline>,
    /// The game's chapters in order, each with its mode and how many maps it has (a board's time
    /// counts once a player has a time on all of them).
    chapters: Vec<ChapterInfo>,
}

struct ChapterInfo {
    id: i32,
    mode: String,
    maps: u32,
}

/// Cached answers per (game, player, day): both only change with the timeline, which is
/// cleared whenever runs change, or with the date.
#[derive(Default)]
struct HistoryCache {
    games: Mutex<HashMap<i32, Arc<Timeline>>>,
    histories: Mutex<HashMap<(i32, String, NaiveDate), Arc<Vec<HistoryPoint>>>>,
    peaks: Mutex<HashMap<(i32, String, NaiveDate), Arc<BTreeMap<String, Peak>>>>,
    /// Everyone's peaks per game ([all_peaks]).
    all_peaks: Mutex<HashMap<i32, Arc<Vec<PlayerPeaks>>>>,
    /// Every board's totals per (game, moment; None = now) for [aggregates].
    snapshots: Mutex<HashMap<SnapshotKey, Arc<Snapshot>>>,
}

/// A snapshot's game and moment (None = now).
type SnapshotKey = (i32, Option<NaiveDateTime>);

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
    c.all_peaks.lock().await.clear();
    c.snapshots.lock().await.clear();
    crate::controllers::site_stats::clear();
    crate::controllers::wr_stats::clear();
}

async fn timeline(pool: &PgPool, game_id: i32) -> Result<Arc<Timeline>, sqlx::Error> {
    if let Some(t) = cache().games.lock().await.get(&game_id) {
        return Ok(t.clone());
    }
    let rows = sqlx::query_as::<_, RunRow>(
        r#"
            -- About 40k imported runs have no date; they count from Portal 2's release, as the
            -- boards count them.
            SELECT cl.map_id, m.chapter_id, c.game_mode, cl.profile_number, cl.score,
                COALESCE(cl.timestamp, TIMESTAMP '2011-04-19 00:00:00') AS timestamp,
                COALESCE(cl.coop_id, -cl.id) AS run_key, cl.id
            FROM changelog AS cl
                JOIN maps AS m ON m.steam_id = cl.map_id
                JOIN chapters AS c ON c.id = m.chapter_id
            WHERE c.game_id = $1 AND cl.verified AND NOT cl.banned
              -- Anti-joins rather than joins: the planner badly underestimates the rows here and
              -- picked a nested loop over every player (minutes per game).
              AND NOT EXISTS (SELECT 1 FROM users AS bu WHERE bu.profile_number = cl.profile_number AND bu.banned)
              AND cl.category_id = m.default_cat_id AND cl.profile_number <> 'N/A'
              -- A co-op run counts once both halves are verified and neither half nor player is banned
              -- (as on the co-op map page). Bundles with a bad half are found once (a hashed set);
              -- this run's own half is already checked above.
              AND (cl.coop_id IS NULL OR cl.coop_id NOT IN (
                  SELECT cb.id FROM coop_bundled AS cb
                      JOIN changelog AS o ON o.id IN (cb.cl_id1, cb.cl_id2)
                      JOIN users AS ou ON ou.profile_number = o.profile_number
                  WHERE NOT o.verified OR o.banned OR ou.banned
              ))
            -- By the expression, not a column number: adding a column once broke the order.
            ORDER BY COALESCE(cl.timestamp, TIMESTAMP '2011-04-19 00:00:00'), cl.id
        "#,
    )
    .bind(game_id)
    .fetch_all(pool)
    .await?;
    let chapters: Vec<ChapterInfo> = sqlx::query_as::<_, (i32, String, i64)>(
        "SELECT c.id, c.game_mode, count(m.steam_id) FROM chapters AS c LEFT JOIN maps AS m ON m.chapter_id = c.id WHERE c.game_id = $1 GROUP BY c.id, c.game_mode ORDER BY c.id",
    )
    .bind(game_id)
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|(id, mode, maps)| ChapterInfo { id, mode, maps: maps as u32 })
    .collect();
    let chapter_index: HashMap<i32, usize> = chapters.iter().enumerate().map(|(i, c)| (c.id, i)).collect();
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
            let chapter = chapter_index.get(&r.chapter_id).copied().unwrap_or_default();
            maps.push(MapTimeline { map_id: r.map_id, mode, chapter, runs: Vec::new(), ids: Vec::new() });
        }
        let next_player = players.len() as u32;
        let pi = *players.entry(r.profile_number).or_insert(next_player);
        maps[mi].runs.push((r.timestamp, pi, r.score, r.run_key));
        maps[mi].ids.push(r.id);
    }
    let t = Arc::new(Timeline { modes, players, maps, chapters });
    cache().games.lock().await.insert(game_id, t.clone());
    Ok(t)
}

/// Whether every map's runs in the game's timeline are in time order, as the sweeps assume (tests).
#[cfg(test)]
pub(crate) async fn runs_in_time_order(pool: &PgPool, game_id: i32) -> Result<bool, sqlx::Error> {
    let t = timeline(pool, game_id).await?;
    Ok(t.maps.iter().all(|m| m.runs.windows(2).all(|w| w[0].0 <= w[1].0)))
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
        // The player's points on this map only change when its runs do: worked out again then,
        // carried over otherwise (there can be thousands of sample instants).
        let mut points = 0.0;
        for (si, end) in ends.iter().enumerate() {
            let before = i;
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
            if i != before {
                points = best.get(&me).map_or(0.0, |&(mine, _)| {
                    let faster: u32 = counts.range(..mine).map(|(_, c)| *c).sum();
                    score(faster as i32 + 1) as f64
                });
            }
            totals[si][map.mode] += points;
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
    /// Overall place among players of the same country (their country now), if they have one.
    pub country_place: Option<u32>,
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
    // Overall place among the players of the same country then.
    let countrymates: Vec<String> = sqlx::query_scalar(
        "SELECT u.profile_number FROM users AS u JOIN users AS me ON me.profile_number = $1 WHERE me.country_id IS NOT NULL AND u.country_id = me.country_id",
    )
    .bind(profile_number)
    .fetch_all(pool)
    .await?;
    let my_overall = total_of(mine, None);
    let country_place = (!countrymates.is_empty() && my_overall > 0.0).then(|| {
        countrymates.iter().filter_map(|pn| t.players.get(pn)).filter(|&&p| total_of(p as usize, None) > my_overall).count() as u32 + 1
    });
    maps.sort_by(|a, b| a.map_id.cmp(&b.map_id));
    Ok(Some(ProfileAt { at, points, places, country_place, maps }))
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
        for b in bests_at(map, at, by_run) {
            totals[b.player as usize * modes + map.mode] += b.points;
            if Some(b.player) == me {
                let ts = map.runs[b.index].0;
                maps.push(MapStanding { map_id: map.map_id.clone(), score: b.score, rank: b.rank, points: b.points, changelog_id: map.ids[b.index], timestamp: (ts != release).then_some(ts) });
            }
        }
    }
    (totals, maps)
}

/// A player's best on a map as of a moment, with its rank and points then.
struct Best {
    player: u32,
    score: i32,
    rank: u32,
    points: f64,
    /// Index in the map's `runs`.
    index: usize,
}

/// Everyone's best on `map` as of `at`, ranked as the points boards rank them (ties share a rank;
/// co-op counts runs, not players, when `by_run`).
fn bests_at(map: &MapTimeline, at: NaiveDateTime, by_run: bool) -> Vec<Best> {
    // Each player's best: (score, run, index in `runs`).
    let mut best: HashMap<u32, (i32, i64, usize)> = HashMap::new();
    for (i, &(ts, p, s, run)) in map.runs.iter().enumerate() {
        if ts > at {
            break;
        }
        if best.get(&p).is_none_or(|&(old, _, _)| s < old) {
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
    best.into_iter()
        .map(|(player, (s, _, index))| {
            let rank = counts.range(..s).map(|(_, c)| *c).sum::<u32>() + 1;
            Best { player, score: s, rank, points: score(rank as i32) as f64, index }
        })
        .collect()
}

/// Where a player stands on one board: rank, value, and the gap to the next player up and to first.
#[derive(Debug, Serialize, PartialEq)]
pub struct Standing<T> {
    pub rank: u32,
    pub value: T,
    /// Value minus the next better one (None when first).
    pub next: Option<T>,
    /// Value minus the best one.
    pub wr: T,
}

/// One aggregated board for a player: points, and time when they have a time on every map.
#[derive(Debug, Serialize, PartialEq)]
pub struct AggregateRow {
    /// `chapter-{id}`, a mode (`sp`, `coop`, `story`, ...) or `overall`, as the points boards key them.
    pub board: String,
    pub points: Option<Standing<f64>>,
    /// Sum of the player's times on the board's maps, in centiseconds.
    pub time: Option<Standing<i64>>,
}

/// Every board's totals as of a moment: points per player, and time per player (None until they
/// have a time on every map of the board).
struct Snapshot {
    boards: Vec<(String, Vec<f64>, Vec<Option<i64>>)>,
}

/// Every board of the game: each chapter with maps, each mode, then overall.
fn snapshot(t: &Timeline, at: NaiveDateTime) -> Snapshot {
    let by_run = crate::tools::config::coop_by_run();
    let (players, chapters) = (t.players.len(), t.chapters.len().max(1));
    let mut points = vec![0.0f64; players * chapters];
    let mut times = vec![0i64; players * chapters];
    let mut counts = vec![0u32; players * chapters];
    for map in &t.maps {
        for b in bests_at(map, at, by_run) {
            let i = b.player as usize * chapters + map.chapter;
            points[i] += b.points;
            times[i] += b.score as i64;
            counts[i] += 1;
        }
    }
    let mut sets: Vec<(String, Vec<usize>)> = Vec::new();
    for (ci, c) in t.chapters.iter().enumerate().filter(|(_, c)| c.maps > 0) {
        sets.push((format!("chapter-{}", c.id), vec![ci]));
    }
    let mut modes: Vec<&str> = Vec::new();
    for c in t.chapters.iter().filter(|c| c.maps > 0) {
        if !modes.contains(&c.mode.as_str()) {
            modes.push(&c.mode);
        }
    }
    for mode in modes {
        sets.push((mode.to_string(), t.chapters.iter().enumerate().filter(|(_, c)| c.mode == mode && c.maps > 0).map(|(i, _)| i).collect()));
    }
    sets.push(("overall".to_string(), (0..t.chapters.len()).filter(|&i| t.chapters[i].maps > 0).collect()));
    let boards = sets
        .into_iter()
        .map(|(key, set)| {
            let needed: u32 = set.iter().map(|&ci| t.chapters[ci].maps).sum();
            let (mut pts, mut tms) = (Vec::with_capacity(players), Vec::with_capacity(players));
            for p in 0..players {
                let base = p * chapters;
                pts.push(set.iter().map(|&ci| points[base + ci]).sum::<f64>());
                let done: u32 = set.iter().map(|&ci| counts[base + ci]).sum();
                tms.push((done == needed).then(|| set.iter().map(|&ci| times[base + ci]).sum::<i64>()));
            }
            (key, pts, tms)
        })
        .collect();
    Snapshot { boards }
}

/// Most snapshots kept (each a few MB for Portal 2): now, and a few looked-back days.
const MAX_SNAPSHOTS: usize = 8;

/// The player's place on every aggregated board of the game, now (`at` None) or as of `at`, like
/// the old boards' "aggregated times and points": points, and time where they have every map.
/// None when they have no runs in the game.
pub async fn aggregates(pool: &PgPool, game_id: i32, profile_number: &str, at: Option<NaiveDateTime>) -> Result<Option<Vec<AggregateRow>>, sqlx::Error> {
    let t = timeline(pool, game_id).await?;
    let Some(&me) = t.players.get(profile_number) else {
        return Ok(None);
    };
    let key = (game_id, at);
    let cached = cache().snapshots.lock().await.get(&key).cloned();
    let snap = match cached {
        Some(s) => s,
        None => {
            let s = Arc::new(snapshot(&t, at.unwrap_or_else(|| Utc::now().naive_utc())));
            let mut snaps = cache().snapshots.lock().await;
            if snaps.len() >= MAX_SNAPSHOTS {
                snaps.retain(|(_, a), _| a.is_none());
            }
            snaps.insert(key, s.clone());
            s
        }
    };
    Ok(Some(snap.boards.iter().map(|(board, points, times)| aggregate_row(board, points, times, me as usize)).collect()))
}

/// The player's standing on one board from everyone's totals.
fn aggregate_row(board: &str, points: &[f64], times: &[Option<i64>], me: usize) -> AggregateRow {
    let round = |v: f64| (v * 10.0).round() / 10.0;
    let my_points = points[me];
    let points = (my_points > 0.0).then(|| {
        let ahead = points.iter().filter(|&&v| v > my_points);
        let next = ahead.clone().copied().fold(None, |m: Option<f64>, v| Some(m.map_or(v, |m| m.min(v))));
        let best = points.iter().copied().fold(my_points, f64::max);
        Standing { rank: ahead.count() as u32 + 1, value: round(my_points), next: next.map(|n| round(my_points - n)), wr: round(my_points - best) }
    });
    let time = times[me].map(|mine| {
        let faster = times.iter().flatten().filter(|&&v| v < mine);
        let next = faster.clone().copied().max();
        let best = times.iter().flatten().copied().min().unwrap_or(mine);
        Standing { rank: faster.count() as u32 + 1, value: mine, next: next.map(|n| mine - n), wr: mine - best }
    });
    AggregateRow { board: board.to_string(), points, time }
}

/// Legends' points thresholds (Portal 2), as in the role manager's official list
/// (frontend/src/data/roles.js); any one of them is enough.
const LEGENDS: [(&str, f64); 3] = [("sp", 11700.0), ("coop", 9500.0), ("overall", 21000.0)];

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
#[derive(Debug, Clone, Serialize)]
pub struct Peak {
    pub points: f64,
    pub date: NaiveDate,
}

/// A player's peak points per board key (`sp`, `coop`, ... and `overall`). In single player, points
/// only go up when the player sets a run (others can only pass them). Co-op ranked by run is the
/// exception: when two players whose bests were separate runs set one together, a run above the
/// player drops out and they move up without running. So the peak is checked at each of the
/// player's runs and, for co-op, at each moment a run faster than theirs dropped out on a co-op map
/// they play. Undated runs count from release, as on the chart, but release itself isn't a
/// candidate (the chart doesn't start there either).
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

/// The moments a run faster than `me`'s best dropped out of a co-op map's ranking (its players both
/// moved on to other runs), the only times others can move `me` up there.
fn drop_outs_above(map: &MapTimeline, me: u32) -> Vec<NaiveDateTime> {
    let mut best: HashMap<u32, (i32, i64)> = HashMap::new();
    let mut refs: HashMap<i64, u32> = HashMap::new();
    let mut out = Vec::new();
    for &(at, p, s, run) in &map.runs {
        if best.get(&p).is_some_and(|&(old, _)| old <= s) {
            continue;
        }
        if let Some(&(old, old_run)) = best.get(&p) {
            let r = refs.entry(old_run).or_insert(1);
            *r -= 1;
            let mine = best.get(&me).map(|b| b.0);
            if *r == 0 && p != me && mine.is_some_and(|m| old < m) {
                out.push(at);
            }
        }
        best.insert(p, (s, run));
        *refs.entry(run).or_insert(0) += 1;
    }
    out
}

/// Per mode: whether others' runs can lift a player's points there (co-op ranked by run).
fn coop_lifts_possible(t: &Timeline) -> Vec<bool> {
    let by_run = crate::tools::config::coop_by_run();
    t.modes.iter().map(|m| by_run && m == "coop").collect()
}

async fn compute_peak(pool: &PgPool, game_id: i32, profile_number: &str) -> Result<BTreeMap<String, Peak>, sqlx::Error> {
    let t = timeline(pool, game_id).await?;
    Ok(t.players.get(profile_number).map(|&me| peaks_of(&t, me)).unwrap_or_default())
}

/// [points_peak] for player `me` of a timeline.
fn peaks_of(t: &Timeline, me: u32) -> BTreeMap<String, Peak> {
    let release = NaiveDate::from_ymd_opt(2011, 4, 19).unwrap().and_hms_opt(0, 0, 0).unwrap();
    let lifts = coop_lifts_possible(t);
    let mut ends: Vec<NaiveDateTime> = Vec::new();
    for map in &t.maps {
        if !map.runs.iter().any(|r| r.1 == me) {
            continue;
        }
        ends.extend(map.runs.iter().filter(|r| r.1 == me).map(|r| r.0));
        if lifts[map.mode] {
            ends.extend(drop_outs_above(map, me));
        }
    }
    ends.retain(|&at| at != release);
    ends.sort();
    ends.dedup();
    if ends.is_empty() {
        ends.push(Utc::now().naive_utc());
    }
    let totals = totals_at(t, me, &ends);
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
    peaks
}

/// A player's peak points per board key and their points now (from [all_peaks]).
#[derive(Debug, Clone, Serialize)]
pub struct PlayerPeaks {
    pub profile_number: String,
    pub peaks: BTreeMap<String, Peak>,
    pub current: BTreeMap<String, f64>,
}

/// Everyone's peak points in a game, from one pass over the run timeline in time order. The
/// same rules as [points_peak] (which checks one player at the runs that can change their points):
/// here every run is applied in turn, adjusting the points of the players it passes, and the
/// runner's totals, and those of anyone it lifted, are checked against their peaks after each run.
/// Cached with the timeline.
pub async fn all_peaks(pool: &PgPool, game_id: i32) -> Result<Arc<Vec<PlayerPeaks>>, sqlx::Error> {
    if let Some(hit) = cache().all_peaks.lock().await.get(&game_id) {
        return Ok(hit.clone());
    }
    let t = timeline(pool, game_id).await?;
    let started = std::time::Instant::now();
    let timeline = t.clone();
    let result = Arc::new(tokio::task::spawn_blocking(move || compute_all_peaks(&timeline)).await.unwrap_or_default());
    log::info!("peak points for game {game_id}: {} players in {:?}", result.len(), started.elapsed());
    cache().all_peaks.lock().await.insert(game_id, result.clone());
    Ok(result)
}

fn compute_all_peaks(t: &Timeline) -> Vec<PlayerPeaks> {
    let by_run = crate::tools::config::coop_by_run();
    let release = NaiveDate::from_ymd_opt(2011, 4, 19).unwrap().and_hms_opt(0, 0, 0).unwrap();
    let modes = t.modes.len();
    let np = t.players.len();
    // Every run in time order (then changelog id, as the timeline was read).
    let mut events: Vec<(NaiveDateTime, i64, usize, usize)> = Vec::new();
    for (mi, map) in t.maps.iter().enumerate() {
        for (ri, r) in map.runs.iter().enumerate() {
            events.push((r.0, map.ids[ri], mi, ri));
        }
    }
    events.sort_unstable();
    // Per map: each player's best (score, run); references per run (co-op by run: a run stays
    // ranked while either player has it as their best); entries per time and who holds it.
    struct MapState {
        best: HashMap<u32, (i32, i64)>,
        refs: HashMap<i64, u32>,
        counts: BTreeMap<i32, u32>,
        holders: BTreeMap<i32, Vec<u32>>,
    }
    let mut maps: Vec<MapState> = (0..t.maps.len()).map(|_| MapState { best: HashMap::new(), refs: HashMap::new(), counts: BTreeMap::new(), holders: BTreeMap::new() }).collect();
    let mut totals = vec![0.0f64; np * modes];
    let mut peaks: Vec<BTreeMap<String, Peak>> = vec![BTreeMap::new(); np];
    let keys = board_keys(t);
    let rank_of = |counts: &BTreeMap<i32, u32>, s: i32| counts.range(..s).map(|(_, c)| *c).sum::<u32>() as i32 + 1;
    // After an entry at `s` was added (dir +1) or removed (dir -1), the players at slower times
    // moved one rank: give them the difference. Ranks past 200 score nothing, so it stops there.
    // Players moved up (a co-op run dropping out) have their peaks checked too.
    let shift = |st: &MapState, s: i32, dir: i32, mode: usize, totals: &mut Vec<f64>, lifted: &mut Vec<u32>| {
        let mut below: u32 = st.counts.range(..=s).map(|(_, c)| *c).sum();
        for (&x, players) in st.holders.range((std::ops::Bound::Excluded(s), std::ops::Bound::Unbounded)) {
            let new_rank = below as i32 + 1;
            let old_rank = new_rank - dir;
            if new_rank.min(old_rank) > 200 {
                break;
            }
            let delta = score(new_rank) as f64 - score(old_rank) as f64;
            if delta != 0.0 {
                for &q in players {
                    totals[q as usize * modes + mode] += delta;
                    if delta > 0.0 {
                        lifted.push(q);
                    }
                }
            }
            below += st.counts.get(&x).copied().unwrap_or(0);
        }
    };
    // Peaks are checked once everything at an instant is applied (runs can share a timestamp:
    // co-op halves, imports), as the per-player peak sees them.
    let check = |totals: &[f64], peaks: &mut Vec<BTreeMap<String, Peak>>, players: &mut Vec<u32>, at: NaiveDateTime| {
        players.sort_unstable();
        players.dedup();
        if at != release {
            for &p in players.iter() {
                let mine = &totals[p as usize * modes..(p as usize + 1) * modes];
                for (key, mode) in &keys {
                    let value = match mode {
                        Some(m) => mine[*m],
                        None => mine.iter().sum(),
                    };
                    let value = (value * 10.0).round() / 10.0;
                    if value > 0.0 && peaks[p as usize].get(key).map_or(true, |pk| value > pk.points) {
                        peaks[p as usize].insert(key.clone(), Peak { points: value, date: at.date() });
                    }
                }
            }
        }
        players.clear();
    };
    let mut pending: Vec<u32> = Vec::new();
    let mut instant: Option<NaiveDateTime> = None;
    for (ts, _, mi, ri) in events {
        if instant.is_some_and(|i| i != ts) {
            check(&totals, &mut peaks, &mut pending, instant.unwrap());
        }
        instant = Some(ts);
        let (_, p, s, run) = t.maps[mi].runs[ri];
        let mode = t.maps[mi].mode;
        let st = &mut maps[mi];
        if st.best.get(&p).is_some_and(|&(old, _)| old <= s) {
            continue; // not an improvement
        }
        // The player's old best goes.
        if let Some(&(o, orun)) = st.best.get(&p) {
            totals[p as usize * modes + mode] -= score(rank_of(&st.counts, o)) as f64;
            if let Some(h) = st.holders.get_mut(&o) {
                h.retain(|&q| q != p);
                if h.is_empty() {
                    st.holders.remove(&o);
                }
            }
            let gone = if by_run {
                let r = st.refs.entry(orun).or_insert(1);
                *r -= 1;
                *r == 0
            } else {
                true
            };
            if gone {
                st.refs.remove(&orun);
                if let Some(c) = st.counts.get_mut(&o) {
                    *c -= 1;
                    if *c == 0 {
                        st.counts.remove(&o);
                    }
                }
                shift(st, o, -1, mode, &mut totals, &mut pending);
            }
        }
        // The new best comes in.
        st.best.insert(p, (s, run));
        let new = if by_run {
            let r = st.refs.entry(run).or_insert(0);
            *r += 1;
            *r == 1
        } else {
            true
        };
        if new {
            *st.counts.entry(s).or_insert(0) += 1;
            shift(st, s, 1, mode, &mut totals, &mut pending);
        }
        st.holders.entry(s).or_default().push(p);
        totals[p as usize * modes + mode] += score(rank_of(&st.counts, s)) as f64;
        pending.push(p);
    }
    if let Some(at) = instant {
        check(&totals, &mut peaks, &mut pending, at);
    }
    let mut names = vec![String::new(); np];
    for (name, &i) in &t.players {
        names[i as usize] = name.clone();
    }
    let mut out = Vec::new();
    for p in 0..np {
        if peaks[p].is_empty() {
            continue;
        }
        let mine = &totals[p * modes..(p + 1) * modes];
        let current = keys
            .iter()
            .map(|(key, mode)| {
                let v = match mode {
                    Some(m) => mine[*m],
                    None => mine.iter().sum(),
                };
                (key.clone(), (v * 10.0).round() / 10.0)
            })
            .collect();
        out.push(PlayerPeaks { profile_number: names[p].clone(), peaks: std::mem::take(&mut peaks[p]), current });
    }
    out
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

#[cfg(test)]
mod tests {
    use super::*;

    fn ts(day: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 1, day).unwrap().and_hms_opt(12, 0, 0).unwrap()
    }

    /// Two chapters (one map, two maps) in one mode; players 0, 1, 2.
    fn timeline() -> Timeline {
        let map = |id: &str, chapter: usize, runs: Vec<(NaiveDateTime, u32, i32, i64)>| MapTimeline {
            map_id: id.into(),
            mode: 0,
            chapter,
            ids: runs.iter().map(|r| r.3).collect(),
            runs,
        };
        Timeline {
            modes: vec!["sp".into()],
            players: HashMap::from([("a".into(), 0), ("b".into(), 1), ("c".into(), 2)]),
            chapters: vec![ChapterInfo { id: 7, mode: "sp".into(), maps: 1 }, ChapterInfo { id: 8, mode: "sp".into(), maps: 2 }],
            maps: vec![
                // Chapter 7: a 1000, b 1100, c 1200; b improves to 900 on day 5.
                map("m1", 0, vec![(ts(1), 0, 1000, 1), (ts(1), 1, 1100, 2), (ts(1), 2, 1200, 3), (ts(5), 1, 900, 4)]),
                // Chapter 8: a and b on both maps, c only on m2.
                map("m2", 1, vec![(ts(1), 0, 500, 5), (ts(1), 1, 600, 6), (ts(1), 2, 400, 7)]),
                map("m3", 1, vec![(ts(1), 0, 700, 8), (ts(1), 1, 650, 9)]),
            ],
        }
    }

    /// Co-op ranked by run: a player's points can rise without a run of theirs, when two runs above
    /// them drop out because their players paired up again. The peak has to see that moment.
    #[test]
    fn coop_peaks_count_rises_from_others_pairing_up() {
        // Players: a b c d (pairs above), e f (partners of "me"), me.
        let players = HashMap::from([("a".into(), 0), ("b".into(), 1), ("c".into(), 2), ("d".into(), 3), ("e".into(), 4), ("f".into(), 5), ("me".into(), 6)]);
        let map = |id: &str, runs: Vec<(NaiveDateTime, u32, i32, i64)>| MapTimeline { map_id: id.into(), mode: 0, chapter: 0, ids: runs.iter().map(|r| r.3).collect(), runs };
        let t = Timeline {
            modes: vec!["coop".into()],
            players,
            chapters: vec![ChapterInfo { id: 1, mode: "coop".into(), maps: 2 }],
            maps: vec![
                map(
                    "c1",
                    vec![
                        // Day 1: a+b and c+d. Day 2: me+e, third. Day 3: a+c set a faster run (a run more above me).
                        (ts(1), 0, 100, 1), (ts(1), 1, 100, 1), (ts(1), 2, 110, 2), (ts(1), 3, 110, 2),
                        (ts(2), 6, 200, 3), (ts(2), 4, 200, 3),
                        (ts(3), 0, 90, 4), (ts(3), 2, 90, 4),
                        // Day 5: b+d pair up: a+b's and c+d's old runs drop out, and me moves back to third.
                        (ts(5), 1, 95, 5), (ts(5), 3, 95, 5),
                    ],
                ),
                // Day 4: me+f take first on another map (me's last run).
                map("c2", vec![(ts(4), 6, 300, 6), (ts(4), 5, 300, 6)]),
            ],
        };
        let expected = score(3) as f64 + score(1) as f64; // day 5: third on c1, first on c2
        let at_own_runs = (score(3) as f64).max(score(4) as f64 + score(1) as f64);
        assert!(expected > at_own_runs, "the rise after me's last run is the peak");

        let mine = peaks_of(&t, 6);
        assert_eq!(mine["coop"].points, (expected * 10.0).round() / 10.0);
        assert_eq!(mine["coop"].date, ts(5).date());

        let all = compute_all_peaks(&t);
        let me = all.iter().find(|p| p.profile_number == "me").unwrap();
        assert_eq!(me.peaks["coop"].points, mine["coop"].points);
        assert_eq!(me.peaks["coop"].date, ts(5).date());
        assert!(me.peaks["coop"].points >= me.current["coop"], "the peak is never below the points now");
    }

    fn row<'a>(rows: &'a [AggregateRow], board: &str) -> &'a AggregateRow {
        rows.iter().find(|r| r.board == board).unwrap()
    }

    #[test]
    fn boards_rank_points_and_complete_times() {
        let t = timeline();
        let snap = snapshot(&t, ts(2));
        let rows: Vec<AggregateRow> = snap.boards.iter().map(|(b, p, tm)| aggregate_row(b, p, tm, 0)).collect();
        assert_eq!(rows.iter().map(|r| r.board.as_str()).collect::<Vec<_>>(), ["chapter-7", "chapter-8", "sp", "overall"]);
        // Chapter 7 on day 2: a is first in both.
        let c7 = row(&rows, "chapter-7");
        assert_eq!(c7.points.as_ref().map(|p| (p.rank, p.next, p.wr)), Some((1, None, 0.0)));
        assert_eq!(c7.time, Some(Standing { rank: 1, value: 1000, next: None, wr: 0 }));
        // Chapter 8: c has only one of its two maps, so only a (1200) and b (1250) have a time.
        let c8 = row(&rows, "chapter-8");
        assert_eq!(c8.time, Some(Standing { rank: 1, value: 1200, next: None, wr: 0 }));
        let b8 = aggregate_row("chapter-8", &snap.boards[1].1, &snap.boards[1].2, 1);
        assert_eq!(b8.time, Some(Standing { rank: 2, value: 1250, next: Some(50), wr: 50 }));
        let c_overall = aggregate_row("overall", &snap.boards[3].1, &snap.boards[3].2, 2);
        assert_eq!(c_overall.time, None, "c misses a map");
        assert!(c_overall.points.is_some());
    }

    #[test]
    fn looking_back_uses_the_times_of_then() {
        let t = timeline();
        let before = snapshot(&t, ts(2));
        let after = snapshot(&t, ts(6));
        let a_before = aggregate_row("chapter-7", &before.boards[0].1, &before.boards[0].2, 0);
        let a_after = aggregate_row("chapter-7", &after.boards[0].1, &after.boards[0].2, 0);
        assert_eq!(a_before.time.unwrap().rank, 1);
        // b's 900 on day 5 passes a.
        let a_after_time = a_after.time.unwrap();
        assert_eq!((a_after_time.rank, a_after_time.next, a_after_time.wr), (2, Some(100), 100));
        let p = a_after.points.unwrap();
        assert_eq!(p.rank, 2);
        assert!(p.next.unwrap() < 0.0 && p.wr < 0.0, "points gaps are below the players ahead");
    }
}
