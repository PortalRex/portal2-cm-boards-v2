use crate::models::chapters::{ChapterQueryParams, Chapters, Games};
use sqlx::PgPool;

impl Chapters {
    /// Returns the map ids for a given chapter.
    pub async fn get_map_ids(pool: &PgPool, chapter_id: i32) -> Result<Vec<String>, sqlx::Error> {
        sqlx::query_scalar(r#"SELECT maps.steam_id FROM maps WHERE chapter_id=$1"#)
            .bind(chapter_id)
            .fetch_all(pool)
            .await
    }
    /// Returns a [Chapters] by the ID given.
    pub async fn get_chapter_by_id(pool: &PgPool, chapter_id: i32) -> Result<Option<Chapters>, sqlx::Error> {
        sqlx::query_as::<_, Chapters>(r#"SELECT * FROM chapters WHERE id=$1;"#)
            .bind(chapter_id)
            .fetch_optional(pool)
            .await
    }
    #[allow(dead_code)]
    /// Returns `true` if the map is multiplayer, `false` if the map is singleplayer
    pub async fn get_chapter_is_multiplayer(
        pool: &PgPool,
        chapter_id: i32,
    ) -> Result<Option<bool>, sqlx::Error> {
        sqlx::query_scalar(r#"SELECT is_multiplayer FROM chapters WHERE id=$1"#)
            .bind(chapter_id)
            .fetch_optional(pool)
            .await
    }
    #[allow(dead_code)]
    /// Gets the [Games] by the given `chapter_id`.
    pub async fn get_chapter_game(pool: &PgPool, chapter_id: i32) -> Result<Option<Games>, sqlx::Error> {
        sqlx::query_as::<_, Games>(
            r#"SELECT games.id, games.game_name 
            FROM games
            INNER JOIN chapters ON (games.id = chapters.game_id)
            WHERE chapters.id = $1"#,
        )
            .bind(chapter_id)
            .fetch_optional(pool)
            .await
    }
    /// Chapters filtered by name (contains, case-insensitive), single/multiplayer and game.
    pub async fn get_filtered_chapters(
        pool: &PgPool,
        params: ChapterQueryParams,
    ) -> Result<Vec<Chapters>, sqlx::Error> {
        let name = params.chapter_name.filter(|n| !n.trim().is_empty()).map(|n| format!("%{}%", n.trim()));
        sqlx::query_as::<_, Chapters>(
            r#"
                SELECT * FROM chapters
                WHERE ($1::text IS NULL OR LOWER(chapter_name) LIKE LOWER($1))
                  AND ($2::bool IS NULL OR is_multiplayer = $2)
                  AND ($3::int IS NULL OR game_id = $3)
                ORDER BY id
            "#,
        )
        .bind(name)
        .bind(params.is_multiplayer)
        .bind(params.game_id)
        .fetch_all(pool)
        .await
    }
}

