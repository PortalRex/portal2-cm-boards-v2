//! Aggregates computed directly from the changelog for a single game, used for
//! games without the offline points/rank cache that Portal 2 has (e.g. Mel).
use crate::models::points::Points;
use crate::tools::helpers::score;
use sqlx::{FromRow, PgPool};
use std::collections::HashMap;

/// A player's personal best on one map and its rank on that map.
#[derive(Debug, FromRow)]
pub struct PbRank {
    pub profile_number: String,
    pub map_id: String,
    pub score: i32,
    pub rank: i32,
    /// Chapter `game_mode` of the map (sp / coop / story / advanced).
    pub game_mode: Option<String>,
}

#[derive(Debug, FromRow)]
struct UserLabel {
    profile_number: String,
    user_name: Option<String>,
    avatar: Option<String>,
}

/// Personal bests (default category, verified, neither run nor player banned) ranked
/// per map, for maps of `game_id` whose chapter `game_mode` is in `modes` (all modes when `None`),
/// optionally limited to one chapter.
pub async fn pb_ranks(pool: &PgPool, game_id: i32, modes: Option<&[&str]>, chapter: Option<i32>) -> Result<Vec<PbRank>, sqlx::Error> {
    let modes: Option<Vec<String>> = modes.map(|m| m.iter().map(|s| s.to_string()).collect());
    sqlx::query_as::<_, PbRank>(
        r#"
            WITH pbs AS (
                SELECT DISTINCT ON (cl.profile_number, cl.map_id)
                    cl.profile_number, cl.map_id, cl.score, c.game_mode
                FROM changelog AS cl
                    INNER JOIN users AS u ON (u.profile_number = cl.profile_number)
                    INNER JOIN maps AS m ON (m.steam_id = cl.map_id)
                    INNER JOIN chapters AS c ON (c.id = m.chapter_id)
                WHERE c.game_id = $1
                    AND ($2::text[] IS NULL OR c.game_mode = ANY($2))
                    AND ($3::int IS NULL OR c.id = $3)
                    AND u.banned = False
                    AND cl.banned = False
                    AND cl.verified = True
                    AND cl.category_id = m.default_cat_id
                    AND cl.profile_number <> 'N/A'
                ORDER BY cl.profile_number, cl.map_id, cl.score ASC, cl.timestamp ASC
            )
            SELECT profile_number, map_id, score, game_mode,
                (RANK() OVER (PARTITION BY map_id ORDER BY score ASC))::int AS rank
            FROM pbs
        "#,
    )
    .bind(game_id)
    .bind(modes)
    .bind(chapter)
    .fetch_all(pool)
    .await
}

/// Current rank on every map of `game_id` for one player (`{ map_id: rank }`).
pub async fn profile_ranks(pool: &PgPool, profile_number: &str, game_id: i32) -> Result<HashMap<String, i32>, sqlx::Error> {
    Ok(pb_ranks(pool, game_id, None, None)
        .await?
        .into_iter()
        .filter(|pb| pb.profile_number == profile_number)
        .map(|pb| (pb.map_id, pb.rank))
        .collect())
}

/// Sums personal bests into per-player [Points] (without names / avatars).
pub fn totals<'a>(pbs: impl Iterator<Item = &'a PbRank>) -> HashMap<String, Points> {
    let mut totals: HashMap<String, Points> = HashMap::new();
    for pb in pbs {
        let entry = totals.entry(pb.profile_number.clone()).or_insert_with(|| Points {
            points: 0.0,
            score: 0,
            num_scores: 0,
            total_rank_sum: 0,
            worst: (0, String::new()),
            best: (i32::MAX, String::new()),
            user_name: None,
            avatar: None,
        });
        entry.points += score(pb.rank);
        entry.score += pb.score;
        entry.num_scores += 1;
        entry.total_rank_sum += pb.rank;
        if pb.rank > entry.worst.0 {
            entry.worst = (pb.rank, pb.map_id.clone());
        }
        if pb.rank < entry.best.0 {
            entry.best = (pb.rank, pb.map_id.clone());
        }
    }
    totals
}

/// Aggregated points for `game_id` over `modes`, ordered by points, in the same shape the
/// cached Portal 2 points endpoints return.
pub async fn aggregated_points(pool: &PgPool, game_id: i32, modes: Option<&[&str]>, chapter: Option<i32>) -> Result<Vec<(String, Points)>, sqlx::Error> {
    let mut totals = totals(pb_ranks(pool, game_id, modes, chapter).await?.iter());
    let profile_numbers: Vec<String> = totals.keys().cloned().collect();
    let labels = sqlx::query_as::<_, UserLabel>(
        r#"SELECT profile_number, COALESCE(board_name, steam_name) AS user_name, avatar
            FROM users WHERE profile_number = ANY($1)"#,
    )
    .bind(&profile_numbers)
    .fetch_all(pool)
    .await?;
    for label in labels {
        if let Some(entry) = totals.get_mut(&label.profile_number) {
            entry.user_name = label.user_name;
            entry.avatar = label.avatar;
        }
    }

    let mut ordered: Vec<(String, Points)> = totals.into_iter().collect();
    ordered.sort_by(|a, b| b.1.points.partial_cmp(&a.1.points).unwrap_or(std::cmp::Ordering::Equal));
    Ok(ordered)
}
