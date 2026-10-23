//! Notes on runs that only staff see: a thread per run, kept on the first half of a co-op run so
//! both halves share it (as reactions are). The run's older single `admin_note` (set by the
//! board's own syncs) is shown first, as a note from the board.
use crate::controllers::moderation::Refused;
use chrono::NaiveDateTime;
use serde::Serialize;
use sqlx::{FromRow, PgPool};

/// Longest note.
pub const MAX_LEN: usize = 1000;

#[derive(Debug, Serialize, FromRow)]
pub struct StaffNote {
    /// None for the run's older admin note.
    pub id: Option<i64>,
    /// None for notes from the board's own services.
    pub author: Option<String>,
    pub author_name: Option<String>,
    pub avatar: Option<String>,
    pub body: String,
    pub created_at: Option<NaiveDateTime>,
}

/// The run notes are kept on: the co-op run's first half, else the run itself. None if no such run.
async fn thread_of(pool: &PgPool, cl_id: i64) -> Result<Option<i64>, sqlx::Error> {
    sqlx::query_scalar("SELECT COALESCE(cb.cl_id1, cl.id) FROM changelog AS cl LEFT JOIN coop_bundled AS cb ON cb.id = cl.coop_id WHERE cl.id = $1")
        .bind(cl_id)
        .fetch_optional(pool)
        .await
}

/// A run's notes, oldest first (None if there's no such run).
pub async fn list(pool: &PgPool, cl_id: i64) -> Result<Option<Vec<StaffNote>>, sqlx::Error> {
    let Some(thread) = thread_of(pool, cl_id).await? else {
        return Ok(None);
    };
    let notes = sqlx::query_as::<_, StaffNote>(
        r#"
            SELECT NULL::bigint AS id, NULL::varchar AS author, NULL::varchar AS author_name, NULL::varchar AS avatar,
                cl.admin_note AS body, NULL::timestamp AS created_at
            FROM changelog AS cl WHERE cl.id = $2 AND COALESCE(cl.admin_note, '') <> ''
            UNION ALL
            SELECT * FROM (
                SELECT n.id, n.author, COALESCE(u.board_name, u.steam_name, n.author) AS author_name, u.avatar, n.body, n.created_at
                FROM run_staff_notes AS n LEFT JOIN users AS u ON u.profile_number = n.author
                WHERE n.changelog_id = $1
                ORDER BY n.id
            ) AS notes
        "#,
    )
    .bind(thread)
    .bind(cl_id)
    .fetch_all(pool)
    .await?;
    Ok(Some(notes))
}

/// Adds a note to a run's thread (`author` None for the board's own services). Returns its id.
pub async fn add(pool: &PgPool, cl_id: i64, author: Option<&str>, body: &str) -> Result<Result<i64, Refused>, sqlx::Error> {
    let body = body.trim();
    if body.is_empty() {
        return Ok(Err(Refused::Invalid("Write a note.".into())));
    }
    let Some(thread) = thread_of(pool, cl_id).await? else {
        return Ok(Err(Refused::NotFound("No such run.")));
    };
    let id = sqlx::query_scalar("INSERT INTO run_staff_notes (changelog_id, author, body) VALUES ($1, $2, $3) RETURNING id")
        .bind(thread)
        .bind(author)
        .bind(body.chars().take(MAX_LEN).collect::<String>())
        .fetch_one(pool)
        .await?;
    Ok(Ok(id))
}

/// Deletes a note: its author's, or anyone's for the admin tier (`any`).
pub async fn delete(pool: &PgPool, note_id: i64, by: Option<&str>, any: bool) -> Result<Result<(), Refused>, sqlx::Error> {
    let author: Option<Option<String>> = sqlx::query_scalar("SELECT author FROM run_staff_notes WHERE id = $1").bind(note_id).fetch_optional(pool).await?;
    let Some(author) = author else {
        return Ok(Err(Refused::NotFound("No such note.")));
    };
    if !any && author.as_deref() != by {
        return Ok(Err(Refused::Invalid("You can only delete your own notes.".into())));
    }
    sqlx::query("DELETE FROM run_staff_notes WHERE id = $1").bind(note_id).execute(pool).await?;
    Ok(Ok(()))
}
