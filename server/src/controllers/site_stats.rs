//! Site-wide runner statistics for the Stats page, for one game: the site's totals, who leads
//! various counts, the longest-standing world records, and everyone's peak points (from the run
//! timeline, [crate::tools::points_history::all_peaks]). Cached for ten minutes, and dropped
//! with the points cache whenever runs change.
use crate::{
    controllers::game_boards::PbRank,
    tools::points_history::{all_peaks, PlayerPeaks},
};
use chrono::{NaiveDate, NaiveDateTime};
use sqlx::{FromRow, PgPool};
use std::{
    collections::{BTreeMap, HashMap},
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, Instant},
};

/// How long a game's stats are kept before they're worked out again.
const MAX_AGE: Duration = Duration::from_secs(10 * 60);
/// Players per leader list.
const LEADERS: i64 = 10;
/// Players per peak points list.
const PEAKS: usize = 100;
/// Longest-standing world records listed.
const LONGEST: i64 = 15;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Leader {
    pub profile_number: String,
    pub user_name: String,
    pub avatar: Option<String>,
    pub value: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Totals {
    pub runners: i64,
    pub runs: i64,
    pub world_records: i64,
    pub demos: i64,
    pub rendered: i64,
    pub maps: i64,
    pub countries: i64,
    pub runs_year: i64,
    pub runners_year: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct LongestWr {
    pub map_id: String,
    pub map_name: String,
    pub is_coop: bool,
    pub score: i32,
    pub since: NaiveDateTime,
    pub profile_number: String,
    pub user_name: String,
    pub avatar: Option<String>,
    pub partner_number: Option<String>,
    pub partner_name: Option<String>,
    pub partner_avatar: Option<String>,
}

/// One player on a peak points list.
#[derive(Debug, Clone, Serialize)]
pub struct PeakEntry {
    pub profile_number: String,
    pub user_name: String,
    pub avatar: Option<String>,
    pub points: f64,
    pub date: NaiveDate,
    /// Their points on that board now.
    pub current: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SiteStats {
    pub totals: Totals,
    pub leaders: BTreeMap<String, Vec<Leader>>,
    pub longest_wrs: Vec<LongestWr>,
    /// Per board key (`sp`, `coop`, ... and `overall`), highest peak first.
    pub peaks: BTreeMap<String, Vec<PeakEntry>>,
}

/// The runs that count, as the points boards count them: verified, not banned, by an unbanned
/// player, in the map's main category.
const RUNS: &str = r#"
    WITH runs AS (
        SELECT cl.id, cl.profile_number, cl.map_id, cl.score, cl.timestamp, cl.demo_id, cl.autorender_id,
            cl.post_rank, cl.wr_hidden, cl.portals, cl.score_delta, cl.coop_id, c.is_multiplayer
        FROM changelog AS cl
            JOIN maps AS m ON m.steam_id = cl.map_id
            JOIN chapters AS c ON c.id = m.chapter_id
        WHERE c.game_id = $1 AND cl.verified AND NOT cl.banned AND cl.category_id = m.default_cat_id
          AND cl.profile_number <> 'N/A'
          AND NOT EXISTS (SELECT 1 FROM users AS bu WHERE bu.profile_number = cl.profile_number AND bu.banned)
    )
"#;

static CACHE: OnceLock<Mutex<HashMap<i32, (Instant, Arc<SiteStats>)>>> = OnceLock::new();

fn cache() -> &'static Mutex<HashMap<i32, (Instant, Arc<SiteStats>)>> {
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Drops every game's stats (called with the points cache's invalidation).
pub fn clear() {
    if let Ok(mut c) = cache().lock() {
        c.clear();
    }
}

/// The game's stats, worked out when missing or older than [MAX_AGE]. `pbs` are the game's
/// current personal bests with ranks (from the points cache), for the records held now.
pub async fn site_stats(pool: &PgPool, game_id: i32, pbs: &[PbRank]) -> Result<Arc<SiteStats>, sqlx::Error> {
    if let Some((built, stats)) = cache().lock().ok().and_then(|c| c.get(&game_id).cloned()) {
        if built.elapsed() < MAX_AGE {
            return Ok(stats);
        }
    }
    let stats = Arc::new(compute(pool, game_id, pbs).await?);
    if let Ok(mut c) = cache().lock() {
        c.insert(game_id, (Instant::now(), stats.clone()));
    }
    Ok(stats)
}

/// The top players by `aggregate` over their qualifying runs (`filter`: extra SQL on `runs`).
async fn leaders(pool: &PgPool, game_id: i32, aggregate: &str, filter: &str) -> Result<Vec<Leader>, sqlx::Error> {
    let sql = format!(
        r#"{RUNS}
        SELECT r.profile_number, COALESCE(u.board_name, u.steam_name, r.profile_number) AS user_name, u.avatar,
            ({aggregate})::bigint AS value
        FROM runs AS r JOIN users AS u ON u.profile_number = r.profile_number
        {filter}
        GROUP BY r.profile_number, u.board_name, u.steam_name, u.avatar
        ORDER BY value DESC, user_name
        LIMIT $2"#
    );
    sqlx::query_as::<_, Leader>(&sql).bind(game_id).bind(LEADERS).fetch_all(pool).await
}

async fn compute(pool: &PgPool, game_id: i32, pbs: &[PbRank]) -> Result<SiteStats, sqlx::Error> {
    let totals = sqlx::query_as::<_, Totals>(&format!(
        r#"{RUNS}
        SELECT COUNT(DISTINCT profile_number) AS runners,
            COUNT(*) AS runs,
            COUNT(*) FILTER (WHERE post_rank = 1 AND NOT wr_hidden) AS world_records,
            COUNT(*) FILTER (WHERE demo_id IS NOT NULL) AS demos,
            COUNT(*) FILTER (WHERE autorender_id IS NOT NULL) AS rendered,
            COUNT(DISTINCT map_id) AS maps,
            (SELECT COUNT(DISTINCT u.country_id) FROM users AS u
                WHERE u.country_id IS NOT NULL AND u.profile_number IN (SELECT profile_number FROM runs)) AS countries,
            COUNT(*) FILTER (WHERE timestamp >= now() - interval '365 days') AS runs_year,
            COUNT(DISTINCT profile_number) FILTER (WHERE timestamp >= now() - interval '365 days') AS runners_year
        FROM runs"#
    ))
    .bind(game_id)
    .fetch_one(pool)
    .await?;

    let mut leaders_by: BTreeMap<String, Vec<Leader>> = BTreeMap::new();
    for (key, aggregate, filter) in [
        ("wr_set", "COUNT(*)", "WHERE r.post_rank = 1 AND NOT r.wr_hidden"),
        ("runs", "COUNT(*)", ""),
        ("runs_year", "COUNT(*)", "WHERE r.timestamp >= now() - interval '365 days'"),
        ("demos", "COUNT(*)", "WHERE r.demo_id IS NOT NULL"),
        ("portals", "SUM(r.portals)", "WHERE r.portals IS NOT NULL"),
        ("time_saved", "SUM(-r.score_delta)", "WHERE r.score_delta < 0"),
    ] {
        leaders_by.insert(key.to_string(), leaders(pool, game_id, aggregate, filter).await?);
    }
    // Distinct co-op partners (either side of a bundle).
    let partners = sqlx::query_as::<_, Leader>(&format!(
        r#"{RUNS}, pairs AS (
            SELECT cb.p_id1 AS p, cb.p_id2 AS partner FROM coop_bundled AS cb WHERE cb.id IN (SELECT coop_id FROM runs WHERE coop_id IS NOT NULL)
            UNION
            SELECT cb.p_id2, cb.p_id1 FROM coop_bundled AS cb WHERE cb.id IN (SELECT coop_id FROM runs WHERE coop_id IS NOT NULL)
        )
        SELECT p.p AS profile_number, COALESCE(u.board_name, u.steam_name, p.p) AS user_name, u.avatar, COUNT(DISTINCT p.partner)::bigint AS value
        FROM pairs AS p JOIN users AS u ON u.profile_number = p.p
        WHERE p.p <> 'N/A' AND p.partner <> 'N/A' AND p.p <> p.partner AND NOT u.banned
        GROUP BY p.p, u.board_name, u.steam_name, u.avatar
        ORDER BY value DESC, user_name
        LIMIT $2"#
    ))
    .bind(game_id)
    .bind(LEADERS)
    .fetch_all(pool)
    .await?;
    leaders_by.insert("partners".to_string(), partners);
    // World records held now: rank 1 on the current boards (ties share it).
    let mut held: HashMap<&str, i64> = HashMap::new();
    for pb in pbs.iter().filter(|pb| pb.rank == 1) {
        *held.entry(pb.profile_number.as_str()).or_insert(0) += 1;
    }
    let mut held: Vec<(&str, i64)> = held.into_iter().collect();
    held.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(b.0)));
    held.truncate(LEADERS as usize);
    let names = labels(pool, held.iter().map(|(p, _)| p.to_string()).collect()).await?;
    leaders_by.insert(
        "wr_held".to_string(),
        held.into_iter()
            .map(|(p, value)| {
                let (user_name, avatar) = names.get(p).cloned().unwrap_or((p.to_string(), None));
                Leader { profile_number: p.to_string(), user_name, avatar, value }
            })
            .collect(),
    );

    // The current record on each map and when it was set (the earliest run with that time);
    // undated imported records can't be placed, so they're left out.
    let longest_wrs = sqlx::query_as::<_, LongestWr>(&format!(
        r#"{RUNS}, best AS (SELECT map_id, MIN(score) AS score FROM runs GROUP BY map_id),
        record AS (
            SELECT DISTINCT ON (r.map_id) r.map_id, r.score, r.timestamp, r.profile_number, r.coop_id, r.is_multiplayer
            FROM runs AS r JOIN best AS b ON b.map_id = r.map_id AND b.score = r.score
            WHERE r.timestamp IS NOT NULL
            ORDER BY r.map_id, r.timestamp, r.id
        )
        SELECT rec.map_id, m.name AS map_name, rec.is_multiplayer AS is_coop, rec.score, rec.timestamp AS since,
            rec.profile_number, COALESCE(u.board_name, u.steam_name, rec.profile_number) AS user_name, u.avatar,
            NULLIF(CASE WHEN cb.p_id1 = rec.profile_number THEN cb.p_id2 ELSE cb.p_id1 END, 'N/A') AS partner_number,
            COALESCE(pu.board_name, pu.steam_name) AS partner_name, pu.avatar AS partner_avatar
        FROM record AS rec
            JOIN maps AS m ON m.steam_id = rec.map_id
            JOIN users AS u ON u.profile_number = rec.profile_number
            LEFT JOIN coop_bundled AS cb ON cb.id = rec.coop_id
            LEFT JOIN users AS pu ON pu.profile_number = (CASE WHEN cb.p_id1 = rec.profile_number THEN cb.p_id2 ELSE cb.p_id1 END) AND pu.profile_number <> 'N/A'
        ORDER BY rec.timestamp, map_name
        LIMIT $2"#
    ))
    .bind(game_id)
    .bind(LONGEST)
    .fetch_all(pool)
    .await?;

    let peaks = peak_lists(pool, &all_peaks(pool, game_id).await?).await?;
    Ok(SiteStats { totals, leaders: leaders_by, longest_wrs, peaks })
}

/// Names and pictures for profile numbers.
async fn labels(pool: &PgPool, ids: Vec<String>) -> Result<HashMap<String, (String, Option<String>)>, sqlx::Error> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let rows: Vec<(String, String, Option<String>)> =
        sqlx::query_as("SELECT profile_number, COALESCE(board_name, steam_name, profile_number), avatar FROM users WHERE profile_number = ANY($1)")
            .bind(&ids)
            .fetch_all(pool)
            .await?;
    Ok(rows.into_iter().map(|(p, n, a)| (p, (n, a))).collect())
}

/// The top players by peak per board key, with their points now.
async fn peak_lists(pool: &PgPool, all: &[PlayerPeaks]) -> Result<BTreeMap<String, Vec<PeakEntry>>, sqlx::Error> {
    let keys: Vec<String> = {
        let mut k: Vec<String> = all.iter().flat_map(|p| p.peaks.keys().cloned()).collect();
        k.sort();
        k.dedup();
        k
    };
    let mut lists: BTreeMap<String, Vec<(&PlayerPeaks, f64, NaiveDate)>> = BTreeMap::new();
    for key in &keys {
        let mut l: Vec<(&PlayerPeaks, f64, NaiveDate)> = all.iter().filter_map(|p| p.peaks.get(key).map(|pk| (p, pk.points, pk.date))).collect();
        l.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal).then(a.2.cmp(&b.2)));
        l.truncate(PEAKS);
        lists.insert(key.clone(), l);
    }
    let ids: Vec<String> = lists.values().flatten().map(|(p, _, _)| p.profile_number.clone()).collect();
    let names = labels(pool, ids).await?;
    Ok(lists
        .into_iter()
        .map(|(key, l)| {
            let entries = l
                .into_iter()
                .map(|(p, points, date)| {
                    let (user_name, avatar) = names.get(&p.profile_number).cloned().unwrap_or((p.profile_number.clone(), None));
                    PeakEntry { profile_number: p.profile_number.clone(), user_name, avatar, points, date, current: p.current.get(&key).copied().unwrap_or(0.0) }
                })
                .collect();
            (key, entries)
        })
        .collect())
}
