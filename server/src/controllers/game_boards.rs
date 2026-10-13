//! Aggregates computed directly from the changelog for a game: each player's personal bests
//! and ranks, and their point totals. Served through [crate::tools::points_cache].
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
    pub chapter_id: Option<i32>,
}

/// Personal bests (default category, verified, neither run nor player banned) ranked
/// per map (co-op by run or by player, see [crate::tools::config::coop_by_run]), for maps of `game_id` whose chapter `game_mode` is in `modes` (all modes when `None`),
/// optionally limited to one chapter.
pub async fn pb_ranks(pool: &PgPool, game_id: i32, modes: Option<&[&str]>, chapter: Option<i32>) -> Result<Vec<PbRank>, sqlx::Error> {
    let modes: Option<Vec<String>> = modes.map(|m| m.iter().map(|s| s.to_string()).collect());
    sqlx::query_as::<_, PbRank>(
        r#"
            WITH pbs AS (
                SELECT DISTINCT ON (cl.profile_number, cl.map_id)
                    cl.profile_number, cl.map_id, cl.score, c.game_mode, c.id AS chapter_id,
                    -- Both halves of a co-op run share a coop_id: one run.
                    COALESCE('c' || cl.coop_id, 'r' || cl.id) AS run_key
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
            ),
            -- Each run counted once (its players' bests can point at the same run).
            runs AS (
                SELECT map_id, run_key, MIN(score) AS score FROM pbs GROUP BY map_id, run_key
            ),
            run_ranks AS (
                SELECT map_id, run_key, (RANK() OVER (PARTITION BY map_id ORDER BY score ASC))::int AS rank FROM runs
            )
            SELECT p.profile_number, p.map_id, p.score, p.game_mode, p.chapter_id,
                CASE WHEN $4 THEN r.rank
                    ELSE (RANK() OVER (PARTITION BY p.map_id ORDER BY p.score ASC))::int END AS rank
            FROM pbs AS p
                JOIN run_ranks AS r ON r.map_id = p.map_id AND r.run_key = p.run_key
        "#,
    )
    .bind(game_id)
    .bind(modes)
    .bind(chapter)
    .bind(crate::tools::config::coop_by_run())
    .fetch_all(pool)
    .await
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
