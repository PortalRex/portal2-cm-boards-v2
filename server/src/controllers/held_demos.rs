//! Held demos: uploads refused for a reason that may be the demo parser's or the game's rather than
//! the player's, kept for staff instead of being deleted (`held_demos`, see
//! `db/dbscript/migrations/20261116000000_held_demos.sql`). Which refusals are kept is decided where
//! uploads are checked (Submit Run in `api::v1::handlers::submissions`, SAR's auto-submit in
//! `api::v2`); staff accept or dismiss them (`api::v1::handlers::held_demos`).
//!
//! A held demo's file is under `DEMO.STORAGE/held` until it's reviewed: accepting it copies it onto
//! the run like any submitted demo, and either answer deletes the held file.
use crate::{
    controllers::{
        moderation::{log_action, ActionResult, Refused},
        submissions::DemoInfo,
    },
    tools::{auth::AdminOrService, config::DemoConfig},
};
use chrono::NaiveDateTime;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use std::path::{Path, PathBuf};

/// Held demos one player may have waiting; more are refused as before.
pub const MAX_PENDING_PER_PLAYER: i64 = 10;
/// Held demos the board keeps waiting at once.
pub const MAX_PENDING: i64 = 500;
const DIR: &str = "held";

/// How a held demo came in.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    /// Submit Run.
    Submit,
    /// SAR's auto-submit.
    AutoSubmit,
}

impl Source {
    pub fn as_str(self) -> &'static str {
        match self {
            Source::Submit => "submit",
            Source::AutoSubmit => "autosubmit",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "submit" => Some(Source::Submit),
            "autosubmit" => Some(Source::AutoSubmit),
            _ => None,
        }
    }

    /// `changelog.submission` for a run recorded from it.
    pub fn submission(self) -> i32 {
        match self {
            Source::Submit => 1,
            Source::AutoSubmit => 2,
        }
    }
}

/// A refused upload to keep.
#[derive(Clone, Copy)]
pub struct NewHeld<'a> {
    pub profile_number: &'a str,
    pub map_id: Option<&'a str>,
    pub source: Source,
    /// The time SAR sent.
    pub claimed_score: Option<i32>,
    /// The refusal, as the player is told it.
    pub reason: &'a str,
    pub bytes: &'a [u8],
    /// What the parser read, when it could read the demo.
    pub parsed: Option<&'a DemoInfo>,
    pub note: Option<&'a str>,
    pub youtube_id: Option<&'a str>,
}

/// Where held demos' files are kept.
pub fn held_dir(config: &DemoConfig) -> Option<PathBuf> {
    config.storage.as_deref().filter(|d| !d.is_empty()).map(|d| Path::new(d).join(DIR))
}

fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

/// Keeps a refused upload for staff. `true` when it's kept, or the same file from the player is
/// already waiting; `false` when it can't be (the player or the board has as many waiting as
/// allowed, or there's no storage), and the upload is refused as before.
pub async fn hold(pool: &PgPool, config: &DemoConfig, h: NewHeld<'_>) -> Result<bool, sqlx::Error> {
    let Some(dir) = held_dir(config) else {
        return Ok(false);
    };
    let sha = sha256_hex(h.bytes);
    let (mine, all, same): (i64, i64, bool) = sqlx::query_as(
        r#"
            SELECT COUNT(*) FILTER (WHERE profile_number = $1), COUNT(*),
                   COALESCE(bool_or(profile_number = $1 AND file_sha256 = $2), false)
            FROM held_demos WHERE status = 'pending'
        "#,
    )
    .bind(h.profile_number)
    .bind(&sha)
    .fetch_one(pool)
    .await?;
    if same {
        return Ok(true);
    }
    if mine >= MAX_PENDING_PER_PLAYER || all >= MAX_PENDING {
        return Ok(false);
    }

    let name = sanitize_filename::sanitize(format!("held_{}_{}.dem", h.profile_number, &crate::tools::auth::random_token()[..10]));
    let path = dir.join(&name);
    let written = match tokio::fs::create_dir_all(&dir).await {
        Ok(()) => tokio::fs::write(&path, h.bytes).await,
        Err(e) => Err(e),
    };
    if let Err(e) = written {
        log::error!("held demo storage: {e}");
        return Ok(false);
    }

    let parsed = h.parsed.and_then(|p| serde_json::to_string(p).ok());
    let reason: String = h.reason.chars().take(300).collect();
    let id: Option<i64> = sqlx::query_scalar(
        r#"
            INSERT INTO held_demos (profile_number, map_id, source, claimed_score, reason, file_name, file_sha256, file_size, parsed, note, youtube_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
            ON CONFLICT (profile_number, file_sha256) WHERE status = 'pending' DO NOTHING
            RETURNING id
        "#,
    )
    .bind(h.profile_number)
    .bind(h.map_id)
    .bind(h.source.as_str())
    .bind(h.claimed_score)
    .bind(&reason)
    .bind(&name)
    .bind(&sha)
    .bind(h.bytes.len() as i32)
    .bind(&parsed)
    .bind(h.note)
    .bind(h.youtube_id)
    .fetch_optional(pool)
    .await
    .inspect_err(|_| {
        let _ = std::fs::remove_file(&path);
    })?;
    let Some(id) = id else {
        // The same file came in at the same moment and was kept by that request.
        let _ = tokio::fs::remove_file(&path).await;
        return Ok(true);
    };
    // In the staff log (as from no one, like a run report), so it reaches the staff inbox.
    let details = json!({ "profile_number": h.profile_number, "map_id": h.map_id, "source": h.source.as_str(), "claimed_score": h.claimed_score });
    sqlx::query("INSERT INTO admin_actions (action, target_type, target_id, reason, details) VALUES ('demo.held', 'held_demo', $1, $2, $3::jsonb)")
        .bind(id.to_string())
        .bind(&reason)
        .bind(details.to_string())
        .execute(pool)
        .await?;
    Ok(true)
}

/// A held demo, as staff see it.
#[derive(Debug, Serialize, FromRow)]
pub struct HeldDemoRow {
    pub id: i64,
    pub profile_number: String,
    pub user_name: String,
    pub avatar: Option<String>,
    pub map_id: Option<String>,
    pub map_name: Option<String>,
    pub game_id: Option<i32>,
    pub is_coop: Option<bool>,
    pub source: String,
    pub claimed_score: Option<i32>,
    pub reason: String,
    pub file_size: i32,
    #[serde(skip)]
    pub parsed_json: Option<String>,
    /// What the demo parser read (parse_demo.mjs's output), or null when it couldn't read it.
    #[sqlx(skip)]
    pub parsed: Option<Value>,
    pub note: Option<String>,
    pub youtube_id: Option<String>,
    pub status: String,
    pub changelog_id: Option<i64>,
    pub reviewed_by_name: Option<String>,
    pub reviewed_at: Option<NaiveDateTime>,
    pub review_note: Option<String>,
    pub created_at: NaiveDateTime,
}

/// Held demos by status ("pending", "accepted", "dismissed"; all when None), newest first.
pub async fn list(pool: &PgPool, status: Option<&str>, limit: i64, before: Option<i64>) -> Result<Vec<HeldDemoRow>, sqlx::Error> {
    let mut rows = sqlx::query_as::<_, HeldDemoRow>(
        r#"
            SELECT h.id, h.profile_number, COALESCE(u.board_name, u.steam_name, h.profile_number) AS user_name, u.avatar,
                h.map_id, m.name AS map_name, c.game_id, c.is_multiplayer AS is_coop,
                h.source, h.claimed_score, h.reason, h.file_size, h.parsed::text AS parsed_json, h.note, h.youtube_id,
                h.status, h.changelog_id, COALESCE(ru.board_name, ru.steam_name) AS reviewed_by_name, h.reviewed_at, h.review_note, h.created_at
            FROM held_demos AS h
                LEFT JOIN users AS u ON u.profile_number = h.profile_number
                LEFT JOIN maps AS m ON m.steam_id = h.map_id
                LEFT JOIN chapters AS c ON c.id = m.chapter_id
                LEFT JOIN users AS ru ON ru.profile_number = h.reviewed_by
            WHERE ($1::text IS NULL OR h.status = $1) AND ($3::bigint IS NULL OR h.id < $3)
            ORDER BY h.id DESC
            LIMIT $2
        "#,
    )
    .bind(status)
    .bind(limit)
    .bind(before)
    .fetch_all(pool)
    .await?;
    for row in &mut rows {
        row.parsed = row.parsed_json.take().and_then(|p| serde_json::from_str(&p).ok());
    }
    Ok(rows)
}

/// Held demos waiting for staff.
pub async fn pending_count(pool: &PgPool) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar("SELECT COUNT(*) FROM held_demos WHERE status = 'pending'").fetch_one(pool).await
}

/// A held demo still waiting for staff, for reviewing it.
#[derive(Debug, FromRow)]
pub struct Pending {
    pub id: i64,
    pub profile_number: String,
    pub map_id: Option<String>,
    pub source: String,
    pub claimed_score: Option<i32>,
    pub file_name: String,
    pub note: Option<String>,
    pub youtube_id: Option<String>,
}

impl Pending {
    pub fn path(&self, config: &DemoConfig) -> Option<PathBuf> {
        held_dir(config).map(|d| d.join(&self.file_name))
    }
}

/// Locks a pending held demo for reviewing it, in `tx`. Refused when there's no such demo, it's
/// been reviewed, or another review of it is under way.
pub async fn lock_pending(tx: &mut Transaction<'_, Postgres>, id: i64) -> ActionResult<Pending> {
    let row: Option<(String,)> = sqlx::query_as("SELECT status FROM held_demos WHERE id = $1").bind(id).fetch_optional(&mut **tx).await?;
    match row.as_ref().map(|(s,)| s.as_str()) {
        None => return Ok(Err(Refused::NotFound("No such held demo."))),
        Some("pending") => {}
        Some(_) => return Ok(Err(Refused::Invalid("This demo has already been reviewed.".into()))),
    }
    let locked = sqlx::query_as::<_, Pending>(
        r#"
            SELECT id, profile_number, map_id, source, claimed_score, file_name, note, youtube_id
            FROM held_demos WHERE id = $1 AND status = 'pending'
            FOR UPDATE SKIP LOCKED
        "#,
    )
    .bind(id)
    .fetch_optional(&mut **tx)
    .await?;
    Ok(locked.ok_or_else(|| Refused::Invalid("Someone else is reviewing this demo right now.".into())))
}

/// A pending held demo's file, without locking it (download, re-check).
pub async fn pending(pool: &PgPool, id: i64) -> Result<Option<Pending>, sqlx::Error> {
    sqlx::query_as::<_, Pending>("SELECT id, profile_number, map_id, source, claimed_score, file_name, note, youtube_id FROM held_demos WHERE id = $1 AND status = 'pending'")
        .bind(id)
        .fetch_optional(pool)
        .await
}

/// Stores what the parser now reads from a held demo (null: it couldn't read it). Takes the
/// review's transaction while one holds the demo ([lock_pending]), as another connection would
/// wait on its lock.
pub async fn set_parsed<'e>(db: impl sqlx::PgExecutor<'e>, id: i64, parsed: Option<&DemoInfo>) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE held_demos SET parsed = $2::jsonb WHERE id = $1")
        .bind(id)
        .bind(parsed.and_then(|p| serde_json::to_string(p).ok()))
        .execute(db)
        .await?;
    Ok(())
}

/// Records staff's answer to a locked held demo ([lock_pending]) in `tx`, with the audit-log entry:
/// accepted (the run recorded from it) or dismissed. The file is deleted by the caller once `tx`
/// is committed.
pub async fn review(tx: &mut Transaction<'_, Postgres>, actor: &AdminOrService, held: &Pending, changelog_id: Option<i64>, note: Option<&str>) -> Result<(), sqlx::Error> {
    let actor_profile = match actor {
        AdminOrService::Admin(user) => Some(user.profile_number.as_str()),
        AdminOrService::Service => None,
    };
    let note = note.map(str::trim).filter(|n| !n.is_empty()).map(|n| n.chars().take(500).collect::<String>());
    let status = if changelog_id.is_some() { "accepted" } else { "dismissed" };
    sqlx::query(
        r#"
            UPDATE held_demos SET status = $2, changelog_id = $3, reviewed_by = $4,
                reviewed_at = now() AT TIME ZONE 'utc', review_note = $5
            WHERE id = $1
        "#,
    )
    .bind(held.id)
    .bind(status)
    .bind(changelog_id)
    .bind(actor_profile)
    .bind(&note)
    .execute(&mut **tx)
    .await?;
    let details = json!({ "held_demo": held.id, "profile_number": held.profile_number, "map_id": held.map_id, "source": held.source });
    match changelog_id {
        // The accepted run, so the log links to it.
        Some(cl) => log_action(tx, actor, "held_demo.accept", "run", &cl.to_string(), note.as_deref(), details).await,
        None => log_action(tx, actor, "held_demo.dismiss", "held_demo", &held.id.to_string(), note.as_deref(), details).await,
    }
}

/// Deletes a reviewed held demo's file.
pub async fn remove_file(config: &DemoConfig, held: &Pending) {
    if let Some(path) = held.path(config) {
        if let Err(e) = tokio::fs::remove_file(&path).await {
            log::warn!("held demo {}: {e}", path.display());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sources() {
        for source in [Source::Submit, Source::AutoSubmit] {
            assert_eq!(Source::parse(source.as_str()), Some(source));
        }
        assert_eq!(Source::parse("other"), None);
        assert_eq!(Source::Submit.submission(), 1);
        assert_eq!(Source::AutoSubmit.submission(), 2);
    }

    #[test]
    fn files_go_under_storage() {
        let config = DemoConfig { storage: Some("/data/demos".into()), ..Default::default() };
        assert_eq!(held_dir(&config), Some(Path::new("/data/demos").join("held")));
        assert_eq!(held_dir(&DemoConfig::default()), None);
        assert_eq!(sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }
}
