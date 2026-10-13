//! A player's stats for one game: activity, co-op partners and demo-derived numbers.
use chrono::NaiveDateTime;
use sqlx::{FromRow, PgPool};

#[derive(Debug, Serialize, FromRow)]
pub struct StatsSummary {
    /// Runs on the boards (not banned).
    pub runs: i64,
    pub verified_runs: i64,
    pub runs_with_demo: i64,
    pub runs_with_video: i64,
    pub first_run: Option<NaiveDateTime>,
    pub latest_run: Option<NaiveDateTime>,
    pub sp_maps: i64,
    pub coop_maps: i64,
    pub sp_map_count: i64,
    pub coop_map_count: i64,
    /// Time taken off personal bests through improvements, in centiseconds.
    pub time_saved: i64,
    /// Runs whose demo told us how many portals were placed.
    pub runs_with_portals: i64,
    pub portals_total: i64,
    /// Personal bests (one per map) with a portal count, and their total.
    pub pbs_with_portals: i64,
    pub pb_portals_total: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Partner {
    pub profile_number: String,
    pub user_name: String,
    pub avatar: Option<String>,
    /// Co-op maps the two have a run on together.
    pub maps: i64,
    pub runs: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct FewestPortals {
    pub map_id: String,
    pub map_name: String,
    pub score: i32,
    pub portals: i16,
}

#[derive(Debug, Serialize)]
pub struct ProfileStats {
    pub summary: StatsSummary,
    pub unique_partners: usize,
    pub partners: Vec<Partner>,
    /// Personal bests with the fewest portals.
    pub fewest_portals: Vec<FewestPortals>,
}

pub async fn profile_stats(pool: &PgPool, profile_number: &str, game_id: i32) -> Result<ProfileStats, sqlx::Error> {
    let summary = sqlx::query_as::<_, StatsSummary>(
        r#"
            WITH runs AS (
                SELECT cl.*, c.is_multiplayer
                FROM changelog AS cl JOIN maps AS m ON m.steam_id = cl.map_id JOIN chapters AS c ON c.id = m.chapter_id
                WHERE cl.profile_number = $1 AND c.game_id = $2 AND NOT cl.banned AND cl.category_id = m.default_cat_id
            ), pbs AS (
                SELECT DISTINCT ON (map_id) map_id, score, portals FROM runs WHERE verified ORDER BY map_id, score, timestamp
            ), totals AS (
                SELECT COUNT(*) FILTER (WHERE NOT c.is_multiplayer) AS sp, COUNT(*) FILTER (WHERE c.is_multiplayer) AS coop
                FROM maps AS m JOIN chapters AS c ON c.id = m.chapter_id WHERE c.game_id = $2
            )
            SELECT
                (SELECT COUNT(*) FROM runs) AS runs,
                (SELECT COUNT(*) FROM runs WHERE verified) AS verified_runs,
                (SELECT COUNT(*) FROM runs WHERE demo_id IS NOT NULL) AS runs_with_demo,
                (SELECT COUNT(*) FROM runs WHERE youtube_id IS NOT NULL) AS runs_with_video,
                (SELECT MIN(timestamp) FROM runs) AS first_run,
                (SELECT MAX(timestamp) FROM runs) AS latest_run,
                (SELECT COUNT(DISTINCT map_id) FROM runs WHERE NOT is_multiplayer AND verified) AS sp_maps,
                (SELECT COUNT(DISTINCT map_id) FROM runs WHERE is_multiplayer AND verified) AS coop_maps,
                (SELECT sp FROM totals) AS sp_map_count,
                (SELECT coop FROM totals) AS coop_map_count,
                COALESCE((SELECT -SUM(score_delta) FROM runs WHERE verified AND score_delta < 0), 0)::bigint AS time_saved,
                (SELECT COUNT(*) FROM runs WHERE portals IS NOT NULL) AS runs_with_portals,
                COALESCE((SELECT SUM(portals) FROM runs), 0)::bigint AS portals_total,
                (SELECT COUNT(*) FROM pbs WHERE portals IS NOT NULL) AS pbs_with_portals,
                COALESCE((SELECT SUM(portals) FROM pbs), 0)::bigint AS pb_portals_total
        "#,
    )
    .bind(profile_number)
    .bind(game_id)
    .fetch_one(pool)
    .await?;

    let partners = sqlx::query_as::<_, Partner>(
        r#"
            WITH pairs AS (
                SELECT cl.map_id, CASE WHEN cb.p_id1 = $1 THEN cb.p_id2 ELSE cb.p_id1 END AS partner
                FROM changelog AS cl
                    JOIN maps AS m ON m.steam_id = cl.map_id JOIN chapters AS c ON c.id = m.chapter_id
                    JOIN coop_bundled AS cb ON cb.id = cl.coop_id
                WHERE cl.profile_number = $1 AND c.game_id = $2 AND NOT cl.banned
            )
            SELECT p.partner AS profile_number, COALESCE(u.board_name, u.steam_name, p.partner) AS user_name, u.avatar,
                COUNT(DISTINCT p.map_id) AS maps, COUNT(*) AS runs
            FROM pairs AS p LEFT JOIN users AS u ON u.profile_number = p.partner
            WHERE p.partner IS NOT NULL AND p.partner <> 'N/A' AND p.partner <> $1
            GROUP BY p.partner, u.board_name, u.steam_name, u.avatar
            ORDER BY maps DESC, runs DESC, user_name
        "#,
    )
    .bind(profile_number)
    .bind(game_id)
    .fetch_all(pool)
    .await?;

    let fewest_portals = sqlx::query_as::<_, FewestPortals>(
        r#"
            SELECT * FROM (
                SELECT DISTINCT ON (cl.map_id) cl.map_id, m.name AS map_name, cl.score, cl.portals
                FROM changelog AS cl JOIN maps AS m ON m.steam_id = cl.map_id JOIN chapters AS c ON c.id = m.chapter_id
                WHERE cl.profile_number = $1 AND c.game_id = $2 AND cl.verified AND NOT cl.banned AND cl.category_id = m.default_cat_id
                ORDER BY cl.map_id, cl.score, cl.timestamp
            ) AS pbs
            WHERE portals IS NOT NULL
            ORDER BY portals, map_name
            LIMIT 5
        "#,
    )
    .bind(profile_number)
    .bind(game_id)
    .fetch_all(pool)
    .await?;

    Ok(ProfileStats { summary, unique_partners: partners.len(), partners: partners.into_iter().take(25).collect(), fewest_portals })
}
