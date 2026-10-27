use crate::models::{maps::Maps, sp::*};

use futures::future::try_join_all;
use sqlx::PgPool;

impl SpMap {
    /// Returns a Single Player Map Page.
    /// 
    /// ### Params
    /// - `map_id`
    ///     - The map returned.
    /// - `limit`
    ///     - The lowest rank returned: everyone tied at it is included, so ties across the cutoff
    ///       don't drop the later runs (a board can have a few more entries than `limit`).
    /// - `cat_id`
    ///     - The category the runs have to be from.
    /// - `game_id`
    ///     - The game thee runs have to be from.
    pub async fn get_sp_map_page(
        pool: &PgPool,
        map_id: &String,
        limit: i32,
        cat_id: i32,
        game_id: i32,
        at: Option<chrono::NaiveDateTime>,
    ) -> Result<Vec<SpMap>, sqlx::Error> {
        sqlx::query_as::<_, SpMap>(
            r#"
                SELECT * FROM (
                SELECT t.cl_id,
                    t.timestamp,
                    t.CL_profile_number,
                    t.score,
                    t.demo_id,
                    t.youtube_id,
                    t.submission,
                    t.note,
                    t.category_id,
                    COALESCE(t.board_name, t.steam_name, t.CL_profile_number) AS user_name,
                    t.avatar,
                    t.autorender_id,
                    t.portals,
                    (SELECT d.sar_version FROM demos AS d WHERE d.id = t.demo_id) AS sar_version,
                    RANK() OVER (ORDER BY t.score) AS board_rank
                FROM (
                    SELECT DISTINCT ON (changelog.profile_number)
                        changelog.id as cl_id,
                        changelog.profile_number as CL_profile_number,
                        users.profile_number as U_profile_number, *
                    FROM changelog
                    INNER JOIN users ON (users.profile_number = changelog.profile_number)
                    INNER JOIN maps ON (changelog.map_id = maps.steam_id)
                    INNER JOIN chapters ON (maps.chapter_id = chapters.id)
                        WHERE map_id = $1
                        AND users.banned = False
                        AND changelog.verified = True
                        AND changelog.banned = False
                        AND changelog.category_id = $2
                        AND chapters.game_id = $3
                        -- As of a moment (undated runs count from release, as the boards count them).
                        AND ($5::timestamp IS NULL OR COALESCE(changelog.timestamp, TIMESTAMP '2011-04-19 00:00:00') <= $5)
                    ORDER BY changelog.profile_number, changelog.score ASC
                ) t
                ) AS ranked
                WHERE board_rank <= $4
                -- Equal times: the earlier run first (the order was otherwise left to the planner).
                ORDER BY score, timestamp ASC NULLS LAST, cl_id"#,
        )
        .bind(map_id)
        .bind(cat_id)
        .bind(game_id)
        .bind(limit)
        .bind(at)
        .fetch_all(pool)
        .await
    }
}

impl SpPreview {
    /// Gets preview information for top 7 on an SP Map: the map board's first rows (each player's
    /// best verified run in the map's main category; equal times in the order they were set).
    pub async fn get_sp_preview(pool: &PgPool, map_id: &str) -> Result<Vec<SpPreview>, sqlx::Error> {
        sqlx::query_as::<_, SpPreview>(
            r#"
                SELECT t.cl_profile_number, t.score, t.youtube_id, t.category_id, t.user_name, t.map_id, t.autorender_id
                FROM (
                    SELECT DISTINCT ON (cl.profile_number)
                        cl.id AS cl_id, cl.profile_number AS cl_profile_number, cl.score, cl.youtube_id, cl.category_id,
                        COALESCE(u.board_name, u.steam_name, cl.profile_number) AS user_name, cl.map_id, cl.autorender_id,
                        cl.timestamp
                    FROM changelog AS cl
                    INNER JOIN users AS u ON u.profile_number = cl.profile_number
                    INNER JOIN maps AS m ON m.steam_id = cl.map_id
                    WHERE cl.map_id = $1
                        AND NOT u.banned
                        AND NOT cl.banned
                        AND cl.verified
                        AND cl.category_id = m.default_cat_id
                    ORDER BY cl.profile_number, cl.score ASC, cl.timestamp ASC NULLS LAST, cl.id
                ) t
                -- Equal times: the earlier run first, as on the map board.
                ORDER BY t.score, t.timestamp ASC NULLS LAST, t.cl_id
                LIMIT 7"#,
        )
        .bind(map_id)
        .fetch_all(pool)
        .await
    }
    /// Collects the top 7 preview data for all SP maps of a game (`games.id`).
    pub async fn get_sp_previews(pool: &PgPool, game_id: i32) -> Result<Vec<Vec<SpPreview>>, sqlx::Error> {
        let map_id_vec = Maps::get_steam_ids(pool, false, game_id).await?;
        let futures: Vec<_> = map_id_vec
            .iter()
            .map(|map_id| SpPreview::get_sp_preview(pool, map_id))
            .collect();
        try_join_all(futures).await
    }
}

impl SpBanned {
    /// Returns all profile_numbers and scores associated with banned times on a given map
    pub async fn get_sp_banned(pool: &PgPool, map_id: String) -> Result<Vec<SpBanned>, sqlx::Error> {
        sqlx::query_as::<_, SpBanned>(
            r#"
                SELECT changelog.profile_number, changelog.score 
                    FROM changelog
                    WHERE changelog.banned = True
                        AND changelog.map_id = $1
                    ORDER BY changelog.score ASC
            "#,
        )
        .bind(map_id)
        .fetch_all(pool)
        .await
    }
}
