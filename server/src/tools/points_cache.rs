//! In-memory cache of the aggregated points boards, computed by the server itself.
//!
//! For each game, every player's personal bests and ranks are read once
//! ([crate::controllers::game_boards::pb_ranks]) together with player names; boards
//! (overall, per chapter `game_mode`, per chapter) are then derived in memory on first use and
//! kept with their serialized JSON, so repeated requests don't recompute or re-serialize.
//!
//! The cache for all games is dropped whenever runs change ([invalidate_points] is called by
//! the score-posting and admin endpoints) and rebuilt in the background shortly after (a burst
//! of changes causes one rebuild). It's also rebuilt when older than [MAX_AGE], to pick up
//! changes made directly in the database, and warmed at startup. Each board keeps its JSON and
//! a gzipped copy, so busy boards are compressed once rather than per request.
use crate::{
    controllers::game_boards::{pb_ranks, totals, PbRank},
    models::points::{Points, PointsReadWrapper},
};
use sqlx::{FromRow, PgPool};
use std::{
    collections::HashMap,
    io::Write,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, OnceLock,
    },
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

/// The app's points cache, so any endpoint that changes runs can invalidate it.
pub static POINTS: OnceLock<Arc<PointsCache>> = OnceLock::new();

/// Drops the cached points boards (call after any change to runs).
pub async fn invalidate_points() {
    if let Some(cache) = POINTS.get() {
        cache.invalidate().await;
    }
}

/// Games kept warm, and the boards built ahead of requests.
const WARM: &[(i32, &[(&str, Scope<'static>)])] = &[
    (1, &[("overall", Scope::All), ("sp", Scope::Modes(&["sp"])), ("coop", Scope::Modes(&["coop"]))]),
    (2, &[("overall", Scope::All), ("story", Scope::Modes(&["story"])), ("advanced", Scope::Modes(&["advanced"]))]),
];
/// How long after a change the background rebuild starts (changes in between share it).
const REBUILD_DELAY: Duration = Duration::from_secs(3);

/// Rebuild a game's data when it's older than this, even without an invalidation.
pub const MAX_AGE: Duration = Duration::from_secs(10 * 60);

/// One aggregated board: players ordered by points, and the response body for it.
pub struct Board {
    pub points: Vec<(String, Points)>,
    pub json: Arc<String>,
    /// The JSON gzipped, for clients that accept it.
    pub gzip: Arc<Vec<u8>>,
}

fn gzip(data: &[u8]) -> Vec<u8> {
    let mut enc = flate2::write::GzEncoder::new(Vec::with_capacity(data.len() / 4), flate2::Compression::fast());
    let _ = enc.write_all(data);
    enc.finish().unwrap_or_default()
}

struct GameData {
    built: Instant,
    pbs: Vec<PbRank>,
    labels: HashMap<String, (Option<String>, Option<String>)>,
    boards: HashMap<String, Arc<Board>>,
}

#[derive(Default)]
pub struct PointsCache {
    games: Mutex<HashMap<i32, GameData>>,
    pool: OnceLock<PgPool>,
    rebuild_scheduled: AtomicBool,
}

#[derive(FromRow)]
struct Label {
    profile_number: String,
    user_name: Option<String>,
    avatar: Option<String>,
}

/// Which personal bests a board is made of: all, a chapter `game_mode`, or one chapter.
#[derive(Clone, Copy)]
pub enum Scope<'a> {
    All,
    Modes(&'a [&'a str]),
    Chapter(i32),
}

impl Scope<'_> {
    fn includes(&self, pb: &PbRank) -> bool {
        match self {
            Scope::All => true,
            Scope::Modes(modes) => pb.game_mode.as_deref().is_some_and(|m| modes.contains(&m)),
            Scope::Chapter(id) => pb.chapter_id == Some(*id),
        }
    }
}

impl PointsCache {
    /// Drops every game's cached data (call after any change to runs) and schedules a
    /// background rebuild.
    pub async fn invalidate(self: &Arc<Self>) {
        self.games.lock().await.clear();
        if !self.rebuild_scheduled.swap(true, Ordering::SeqCst) {
            let cache = self.clone();
            tokio::spawn(async move {
                tokio::time::sleep(REBUILD_DELAY).await;
                cache.rebuild_scheduled.store(false, Ordering::SeqCst);
                cache.build_warm_boards().await;
            });
        }
    }

    async fn build_warm_boards(&self) {
        let Some(pool) = self.pool.get() else { return };
        for (game_id, boards) in WARM {
            let started = Instant::now();
            for (key, scope) in boards.iter() {
                if let Err(e) = self.board(pool, *game_id, key, *scope).await {
                    log::warn!("points cache: game {game_id} board {key} failed to build: {e}");
                }
            }
            log::info!("points cache: game {game_id} ready in {:?}", started.elapsed());
        }
    }

    async fn build(pool: &PgPool, game_id: i32) -> Result<GameData, sqlx::Error> {
        let pbs = pb_ranks(pool, game_id, None, None).await?;
        let mut ids: Vec<String> = pbs.iter().map(|pb| pb.profile_number.clone()).collect();
        ids.sort_unstable();
        ids.dedup();
        let labels = sqlx::query_as::<_, Label>(
            "SELECT profile_number, COALESCE(board_name, steam_name) AS user_name, avatar FROM users WHERE profile_number = ANY($1)",
        )
        .bind(&ids)
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|l| (l.profile_number, (l.user_name, l.avatar)))
        .collect();
        Ok(GameData { built: Instant::now(), pbs, labels, boards: HashMap::new() })
    }

    /// Runs `f` on the game's (fresh) data, building it first when missing or stale. Builds
    /// happen under the lock, so concurrent requests wait for one build instead of each
    /// running their own.
    async fn with_game<T>(&self, pool: &PgPool, game_id: i32, f: impl FnOnce(&mut GameData) -> T) -> Result<T, sqlx::Error> {
        let mut games = self.games.lock().await;
        if games.get(&game_id).map_or(true, |g| g.built.elapsed() > MAX_AGE) {
            let data = Self::build(pool, game_id).await?;
            games.insert(game_id, data);
        }
        Ok(f(games.get_mut(&game_id).expect("just built")))
    }

    /// The aggregated board `key` (e.g. "overall", "sp", "chapter-7") for `scope`.
    pub async fn board(&self, pool: &PgPool, game_id: i32, key: &str, scope: Scope<'_>) -> Result<Arc<Board>, sqlx::Error> {
        self.with_game(pool, game_id, |g| {
            if let Some(board) = g.boards.get(key) {
                return board.clone();
            }
            let mut points: Vec<(String, Points)> = totals(g.pbs.iter().filter(|pb| scope.includes(pb))).into_iter().collect();
            for (profile_number, p) in points.iter_mut() {
                if let Some((name, avatar)) = g.labels.get(profile_number) {
                    p.user_name = name.clone();
                    p.avatar = avatar.clone();
                }
            }
            points.sort_by(|a, b| b.1.points.partial_cmp(&a.1.points).unwrap_or(std::cmp::Ordering::Equal));
            let json = serde_json::to_string(&PointsReadWrapper { id: None, points: points.clone() }).unwrap_or_default();
            let gz = gzip(json.as_bytes());
            let board = Arc::new(Board { points, json: Arc::new(json), gzip: Arc::new(gz) });
            g.boards.insert(key.to_string(), board.clone());
            board
        })
        .await
    }

    /// A player's current rank on every map of the game (`{ map_id: rank }`).
    pub async fn ranks(&self, pool: &PgPool, game_id: i32, profile_number: &str) -> Result<HashMap<String, i32>, sqlx::Error> {
        self.with_game(pool, game_id, |g| {
            g.pbs.iter().filter(|pb| pb.profile_number == profile_number).map(|pb| (pb.map_id.clone(), pb.rank)).collect()
        })
        .await
    }

    /// Remembers the pool and builds the warm boards in the background (startup).
    pub fn start(self: &Arc<Self>, pool: PgPool) {
        let _ = self.pool.set(pool);
        let cache = self.clone();
        tokio::spawn(async move { cache.build_warm_boards().await });
    }
}
