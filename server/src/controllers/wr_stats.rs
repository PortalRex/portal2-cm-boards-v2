//! World record statistics for the Stats page, from the world record history (the same runs the
//! map pages' WR chart shows: rank 1 when set, verified, not banned or removed from the history,
//! in the map's main category, by an unbanned player). Per map the history is split into
//! *reigns*: each faster record time, from the first run with it until a faster one; players who
//! tie a record join its reign from their own run.
//!
//! From that: every map's current record, the longest-lasting records, the longest streaks one
//! player held a map, the biggest improvements, days spent holding records, and how many records
//! each player held over time (the race).
//! Cached ten minutes per game; dropped with the points cache when runs change.
use chrono::{Datelike, Duration as ChronoDuration, NaiveDate, NaiveDateTime, Utc};
use sqlx::{FromRow, PgPool};
use std::{
    collections::{BTreeMap, HashMap},
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, Instant},
};

const MAX_AGE: Duration = Duration::from_secs(10 * 60);
const LISTED: usize = 100;
/// Players shown per race frame.
const RACE_TOP: usize = 12;

#[derive(FromRow)]
struct WrRow {
    map_id: String,
    map_name: String,
    map_order: i32,
    is_coop: bool,
    game_mode: String,
    score: i32,
    timestamp: NaiveDateTime,
    profile_number: String,
    user_name: String,
    avatar: Option<String>,
    partner_number: Option<String>,
    partner_name: Option<String>,
    partner_avatar: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Player {
    pub profile_number: String,
    pub user_name: String,
    pub avatar: Option<String>,
}

/// Who set a time: one player, or a co-op pair.
#[derive(Debug, Clone, Serialize)]
pub struct Team {
    pub players: Vec<Player>,
    /// When this team first had the time.
    pub since: NaiveDateTime,
}

impl Team {
    fn key(&self) -> String {
        let mut ids: Vec<&str> = self.players.iter().map(|p| p.profile_number.as_str()).collect();
        ids.sort_unstable();
        ids.join("+")
    }
    fn has(&self, profile: &str) -> bool {
        self.players.iter().any(|p| p.profile_number == profile)
    }
}

struct Reign {
    score: i32,
    start: NaiveDateTime,
    end: Option<NaiveDateTime>,
    teams: Vec<Team>,
}

struct MapHistory {
    map_id: String,
    map_name: String,
    order: i32,
    is_coop: bool,
    mode: String,
    reigns: Vec<Reign>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MapRecord {
    pub map_id: String,
    pub map_name: String,
    pub is_coop: bool,
    pub mode: String,
    pub score: i32,
    pub since: NaiveDateTime,
    pub days: f64,
    pub teams: Vec<Team>,
    /// Record times the map has had.
    pub records: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct Holder {
    pub player: Player,
    /// Maps whose current record they hold (ties count).
    pub held: i64,
    /// Days spent holding records, all maps together.
    pub days: f64,
    /// Record runs they've set.
    pub set: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReignOut {
    pub map_id: String,
    pub map_name: String,
    pub is_coop: bool,
    pub score: i32,
    pub start: NaiveDateTime,
    pub end: Option<NaiveDateTime>,
    pub days: f64,
    pub teams: Vec<Team>,
    pub beaten_by: Vec<Team>,
    pub beaten_with: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Domination {
    pub map_id: String,
    pub map_name: String,
    pub is_coop: bool,
    pub player: Player,
    pub start: NaiveDateTime,
    pub end: Option<NaiveDateTime>,
    pub days: f64,
    /// Record times in a row.
    pub records: usize,
    pub from_score: i32,
    pub to_score: i32,
}

#[derive(Debug, Clone, Serialize)]
pub struct Improvement {
    pub map_id: String,
    pub map_name: String,
    pub is_coop: bool,
    pub from_score: i32,
    pub to_score: i32,
    pub delta: i32,
    pub date: NaiveDateTime,
    pub teams: Vec<Team>,
    pub previous: Vec<Team>,
    /// How long the previous record had stood.
    pub previous_days: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct RaceFrame {
    pub date: NaiveDate,
    /// (profile number, records held), most first.
    pub top: Vec<(String, i64)>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Race {
    pub frames: Vec<RaceFrame>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WrStats {
    pub records: Vec<MapRecord>,
    /// Sum of the current records per board key (`sp`, `coop`, ...).
    pub total_time: BTreeMap<String, i64>,
    pub holders: Vec<Holder>,
    pub longest: Vec<ReignOut>,
    pub domination: Vec<Domination>,
    pub improvements: Vec<Improvement>,
    /// Per board key and `overall`.
    pub race: BTreeMap<String, Race>,
    /// Everyone named in the race frames.
    pub race_players: HashMap<String, Player>,
}

static CACHE: OnceLock<Mutex<HashMap<i32, (Instant, Arc<WrStats>)>>> = OnceLock::new();

fn cache() -> &'static Mutex<HashMap<i32, (Instant, Arc<WrStats>)>> {
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Drops every game's numbers (called with the points cache's invalidation).
pub fn clear() {
    if let Ok(mut c) = cache().lock() {
        c.clear();
    }
}

/// The game's world record stats.
pub async fn wr_stats(pool: &PgPool, game_id: i32) -> Result<Arc<WrStats>, sqlx::Error> {
    if let Some((built, s)) = cache().lock().ok().and_then(|c| c.get(&game_id).cloned()) {
        if built.elapsed() < MAX_AGE {
            return Ok(s);
        }
    }
    let s = Arc::new(compute(pool, game_id).await?);
    if let Ok(mut c) = cache().lock() {
        c.insert(game_id, (Instant::now(), s.clone()));
    }
    Ok(s)
}

fn days(from: NaiveDateTime, to: NaiveDateTime) -> f64 {
    ((to - from).num_seconds().max(0) as f64 / 86400.0 * 10.0).round() / 10.0
}

async fn compute(pool: &PgPool, game_id: i32) -> Result<WrStats, sqlx::Error> {
    let rows = sqlx::query_as::<_, WrRow>(
        r#"
            SELECT cl.map_id, m.name AS map_name, m.id AS map_order, c.is_multiplayer AS is_coop, c.game_mode,
                cl.score, cl.timestamp, cl.profile_number,
                COALESCE(u.board_name, u.steam_name, cl.profile_number) AS user_name, u.avatar,
                NULLIF(CASE WHEN cb.p_id1 = cl.profile_number THEN cb.p_id2 ELSE cb.p_id1 END, 'N/A') AS partner_number,
                COALESCE(pu.board_name, pu.steam_name) AS partner_name, pu.avatar AS partner_avatar
            FROM changelog AS cl
                JOIN maps AS m ON m.steam_id = cl.map_id
                JOIN chapters AS c ON c.id = m.chapter_id
                JOIN users AS u ON u.profile_number = cl.profile_number
                LEFT JOIN coop_bundled AS cb ON cb.id = cl.coop_id
                LEFT JOIN users AS pu ON pu.profile_number = (CASE WHEN cb.p_id1 = cl.profile_number THEN cb.p_id2 ELSE cb.p_id1 END)
            WHERE c.game_id = $1 AND cl.post_rank = 1 AND cl.verified IS TRUE AND cl.banned = false AND cl.wr_hidden = false
              AND cl.category_id = m.default_cat_id AND cl.timestamp IS NOT NULL AND cl.profile_number <> 'N/A' AND NOT u.banned
            ORDER BY cl.map_id, cl.timestamp, cl.id
        "#,
    )
    .bind(game_id)
    .fetch_all(pool)
    .await?;

    // Reigns per map.
    let mut maps: Vec<MapHistory> = Vec::new();
    for r in rows {
        if maps.last().map_or(true, |m| m.map_id != r.map_id) {
            maps.push(MapHistory { map_id: r.map_id.clone(), map_name: r.map_name.clone(), order: r.map_order, is_coop: r.is_coop, mode: r.game_mode.clone(), reigns: Vec::new() });
        }
        let map = maps.last_mut().unwrap();
        let mut players = vec![Player { profile_number: r.profile_number.clone(), user_name: r.user_name.clone(), avatar: r.avatar.clone() }];
        if let Some(pn) = r.partner_number.clone().filter(|p| *p != r.profile_number) {
            players.push(Player { user_name: r.partner_name.clone().unwrap_or_else(|| pn.clone()), profile_number: pn, avatar: r.partner_avatar.clone() });
        }
        let team = Team { players, since: r.timestamp };
        match map.reigns.last_mut() {
            Some(cur) if r.score == cur.score => {
                if !cur.teams.iter().any(|t| t.key() == team.key()) {
                    cur.teams.push(team);
                }
            }
            Some(cur) if r.score > cur.score => {} // slower than the standing record: not a reign of its own
            _ => {
                if let Some(cur) = map.reigns.last_mut() {
                    cur.end = Some(r.timestamp);
                }
                map.reigns.push(Reign { score: r.score, start: r.timestamp, end: None, teams: vec![team] });
            }
        }
    }
    maps.sort_by_key(|m| m.order);
    let now = Utc::now().naive_utc();

    // Current records and the per-board total time.
    let mut records = Vec::new();
    let mut total_time: BTreeMap<String, i64> = BTreeMap::new();
    for m in &maps {
        let Some(cur) = m.reigns.last() else { continue };
        *total_time.entry(m.mode.clone()).or_insert(0) += cur.score as i64;
        records.push(MapRecord {
            map_id: m.map_id.clone(),
            map_name: m.map_name.clone(),
            is_coop: m.is_coop,
            mode: m.mode.clone(),
            score: cur.score,
            since: cur.start,
            days: days(cur.start, now),
            teams: cur.teams.clone(),
            records: m.reigns.len(),
        });
    }

    // Holders: maps held now, days holding (from each player's own run), record runs set.
    let mut hold: HashMap<String, Holder> = HashMap::new();
    for m in &maps {
        for (i, reign) in m.reigns.iter().enumerate() {
            let end = reign.end.unwrap_or(now);
            let current = i + 1 == m.reigns.len();
            for team in &reign.teams {
                for p in &team.players {
                    let h = hold.entry(p.profile_number.clone()).or_insert_with(|| Holder { player: p.clone(), held: 0, days: 0.0, set: 0 });
                    h.days += days(team.since, end);
                    h.set += 1;
                    if current {
                        h.held += 1;
                    }
                }
            }
        }
    }
    let mut holders: Vec<Holder> = hold.into_values().collect();
    for h in holders.iter_mut() {
        h.days = (h.days * 10.0).round() / 10.0;
    }
    holders.sort_by(|a, b| b.days.partial_cmp(&a.days).unwrap_or(std::cmp::Ordering::Equal).then(b.held.cmp(&a.held)));

    // Longest-lasting records (still standing ones included).
    let mut longest: Vec<ReignOut> = Vec::new();
    for m in &maps {
        for (i, reign) in m.reigns.iter().enumerate() {
            let next = m.reigns.get(i + 1);
            longest.push(ReignOut {
                map_id: m.map_id.clone(),
                map_name: m.map_name.clone(),
                is_coop: m.is_coop,
                score: reign.score,
                start: reign.start,
                end: reign.end,
                days: days(reign.start, reign.end.unwrap_or(now)),
                teams: reign.teams.clone(),
                beaten_by: next.map(|n| n.teams.clone()).unwrap_or_default(),
                beaten_with: next.map(|n| n.score),
            });
        }
    }
    longest.sort_by(|a, b| b.days.partial_cmp(&a.days).unwrap_or(std::cmp::Ordering::Equal));
    longest.truncate(LISTED);

    // Domination: one player holding a map through several record times in a row.
    let mut domination: Vec<Domination> = Vec::new();
    for m in &maps {
        let mut ids: Vec<String> = m.reigns.iter().flat_map(|r| r.teams.iter().flat_map(|t| t.players.iter().map(|p| p.profile_number.clone()))).collect();
        ids.sort();
        ids.dedup();
        for pn in ids {
            let mut i = 0;
            while i < m.reigns.len() {
                if !m.reigns[i].teams.iter().any(|t| t.has(&pn)) {
                    i += 1;
                    continue;
                }
                let first = i;
                while i < m.reigns.len() && m.reigns[i].teams.iter().any(|t| t.has(&pn)) {
                    i += 1;
                }
                let last = i - 1;
                if last > first {
                    let player = m.reigns[first].teams.iter().flat_map(|t| t.players.iter()).find(|p| p.profile_number == pn).cloned().unwrap();
                    let start = m.reigns[first].teams.iter().filter(|t| t.has(&pn)).map(|t| t.since).min().unwrap();
                    let end = m.reigns[last].end;
                    domination.push(Domination {
                        map_id: m.map_id.clone(),
                        map_name: m.map_name.clone(),
                        is_coop: m.is_coop,
                        player,
                        start,
                        end,
                        days: days(start, end.unwrap_or(now)),
                        records: last - first + 1,
                        from_score: m.reigns[first].score,
                        to_score: m.reigns[last].score,
                    });
                }
            }
        }
    }
    domination.sort_by(|a, b| b.days.partial_cmp(&a.days).unwrap_or(std::cmp::Ordering::Equal).then(b.records.cmp(&a.records)));
    domination.truncate(LISTED);

    // Biggest improvements to a record.
    let mut improvements: Vec<Improvement> = Vec::new();
    for m in &maps {
        for w in m.reigns.windows(2) {
            improvements.push(Improvement {
                map_id: m.map_id.clone(),
                map_name: m.map_name.clone(),
                is_coop: m.is_coop,
                from_score: w[0].score,
                to_score: w[1].score,
                delta: w[0].score - w[1].score,
                date: w[1].start,
                teams: w[1].teams.clone(),
                previous: w[0].teams.clone(),
                previous_days: days(w[0].start, w[1].start),
            });
        }
    }
    improvements.sort_by(|a, b| b.delta.cmp(&a.delta).then(a.date.cmp(&b.date)));
    improvements.truncate(LISTED);

    // The race: records held by each player at the start of each month.
    let mut race = BTreeMap::new();
    let mut race_players: HashMap<String, Player> = HashMap::new();
    if let Some(first) = maps.iter().filter_map(|m| m.reigns.first().map(|r| r.start)).min() {
        let mut date = NaiveDate::from_ymd_opt(first.year(), first.month(), 1).unwrap();
        let mut dates = Vec::new();
        while date <= now.date() {
            dates.push(date);
            date = if date.month() == 12 { NaiveDate::from_ymd_opt(date.year() + 1, 1, 1).unwrap() } else { NaiveDate::from_ymd_opt(date.year(), date.month() + 1, 1).unwrap() };
        }
        dates.push(now.date() + ChronoDuration::days(1));
        let mut keys: Vec<String> = maps.iter().map(|m| m.mode.clone()).collect();
        keys.sort();
        keys.dedup();
        keys.push("overall".to_string());
        for key in keys {
            let mut frames = Vec::new();
            for d in &dates {
                let at = d.and_hms_opt(0, 0, 0).unwrap();
                let mut counts: HashMap<&str, i64> = HashMap::new();
                for m in maps.iter().filter(|m| key == "overall" || m.mode == key) {
                    let Some(reign) = m.reigns.iter().rev().find(|r| r.start <= at) else { continue };
                    let mut seen: Vec<&str> = Vec::new();
                    for t in reign.teams.iter().filter(|t| t.since <= at) {
                        for p in &t.players {
                            if !seen.contains(&p.profile_number.as_str()) {
                                seen.push(&p.profile_number);
                                *counts.entry(&p.profile_number).or_insert(0) += 1;
                                race_players.entry(p.profile_number.clone()).or_insert_with(|| p.clone());
                            }
                        }
                    }
                }
                let mut top: Vec<(String, i64)> = counts.into_iter().map(|(p, c)| (p.to_string(), c)).collect();
                top.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
                top.truncate(RACE_TOP);
                frames.push(RaceFrame { date: (*d).min(now.date()), top });
            }
            race.insert(key, Race { frames });
        }
        let named: std::collections::HashSet<&String> = race.values().flat_map(|r| r.frames.iter().flat_map(|f| f.top.iter().map(|(p, _)| p))).collect();
        race_players.retain(|p, _| named.contains(p));
    }

    Ok(WrStats { records, total_time, holders, longest, domination, improvements, race, race_players })
}
