//! Anonymous run reports: anyone can report a run; staff review them without seeing who
//! sent them (only a salted hash of the reporter is kept, for duplicate and spam checks).
use crate::{
    controllers::moderation::{log_action, ActionResult, Refused, FILLER},
    tools::auth::AdminOrService,
};
use chrono::NaiveDateTime;
use serde_json::json;
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgPool};

pub const REASONS: &[&str] = &["cheating", "wrong_time", "wrong_player", "bad_proof", "other"];
/// Reports one reporter can send per hour.
const HOURLY_LIMIT: i64 = 5;

/// The anonymous key for a reporter (account or address).
pub fn reporter_key(salt: &str, who: &str) -> String {
    let mut h = Sha256::new();
    h.update(salt.as_bytes());
    h.update(b"|report|");
    h.update(who.as_bytes());
    hex::encode(h.finalize())
}

pub async fn create_report(pool: &PgPool, cl_id: i64, reason: &str, details: Option<&str>, key: &str) -> Result<Result<i64, Refused>, sqlx::Error> {
    if !REASONS.contains(&reason) {
        return Ok(Err(Refused::Invalid("Pick a reason.".into())));
    }
    let details = details.map(str::trim).filter(|d| !d.is_empty()).map(|d| d.chars().take(1000).collect::<String>());
    if reason == "other" && details.is_none() {
        return Ok(Err(Refused::Invalid("Say what's wrong with the run.".into())));
    }
    let run: Option<(String, Option<i64>)> = sqlx::query_as("SELECT profile_number, mirror_of FROM changelog WHERE id = $1").bind(cl_id).fetch_optional(pool).await?;
    let Some((player, mirror_of)) = run else {
        return Ok(Err(Refused::NotFound("No such run.")));
    };
    if player == FILLER {
        return Ok(Err(Refused::NotFound("No such run.")));
    }
    // A linked copy is reported as the original run.
    let cl_id = mirror_of.unwrap_or(cl_id);
    let recent: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM run_reports WHERE reporter_key = $1 AND created_at > (now() AT TIME ZONE 'utc') - interval '1 hour'")
        .bind(key)
        .fetch_one(pool)
        .await?;
    if recent >= HOURLY_LIMIT {
        return Ok(Err(Refused::Invalid("You've sent several reports recently; try again later.".into())));
    }
    let id: Option<i64> = sqlx::query_scalar(
        "INSERT INTO run_reports (changelog_id, reason, details, reporter_key) VALUES ($1, $2, $3, $4) ON CONFLICT (changelog_id, reporter_key) WHERE status = 'open' DO NOTHING RETURNING id",
    )
    .bind(cl_id)
    .bind(reason)
    .bind(details)
    .bind(key)
    .fetch_optional(pool)
    .await?;
    match id {
        Some(id) => Ok(Ok(id)),
        None => Ok(Err(Refused::Invalid("You've already reported this run; staff will look at it.".into()))),
    }
}

#[derive(Debug, Serialize, FromRow)]
pub struct ReportRow {
    pub id: i64,
    pub changelog_id: i64,
    pub reason: String,
    pub details: Option<String>,
    pub status: String,
    pub created_at: NaiveDateTime,
    pub resolved_at: Option<NaiveDateTime>,
    pub resolution_note: Option<String>,
    pub resolved_by_name: Option<String>,
    /// Open reports on the same run.
    pub open_on_run: i64,
    pub map_id: String,
    pub map_name: String,
    pub game_id: i32,
    pub is_coop: bool,
    pub score: i32,
    pub post_rank: Option<i32>,
    pub run_banned: bool,
    pub run_verified: Option<bool>,
    pub has_demo: bool,
    pub youtube_id: Option<String>,
    pub timestamp: Option<NaiveDateTime>,
    pub profile_number: String,
    pub user_name: String,
    pub avatar: Option<String>,
    pub partner: Option<String>,
    pub partner_name: Option<String>,
}

/// Reports by status ("open", "resolved", "dismissed"; all when None), newest first.
pub async fn list_reports(pool: &PgPool, status: Option<&str>, limit: i64, before: Option<i64>) -> Result<Vec<ReportRow>, sqlx::Error> {
    sqlx::query_as::<_, ReportRow>(
        r#"
            SELECT r.id, r.changelog_id, r.reason, r.details, r.status, r.created_at, r.resolved_at, r.resolution_note,
                COALESCE(ru.board_name, ru.steam_name) AS resolved_by_name,
                (SELECT COUNT(*) FROM run_reports AS o WHERE o.changelog_id = r.changelog_id AND o.status = 'open') AS open_on_run,
                cl.map_id, m.name AS map_name, c.game_id, c.is_multiplayer AS is_coop, cl.score, cl.post_rank,
                cl.banned AS run_banned, cl.verified AS run_verified, cl.demo_id IS NOT NULL AS has_demo, cl.youtube_id, cl.timestamp,
                cl.profile_number, COALESCE(u.board_name, u.steam_name, cl.profile_number) AS user_name, u.avatar,
                NULLIF(CASE WHEN cb.p_id1 = cl.profile_number THEN cb.p_id2 ELSE cb.p_id1 END, 'N/A') AS partner,
                COALESCE(pu.board_name, pu.steam_name) AS partner_name
            FROM run_reports AS r
                JOIN changelog AS cl ON cl.id = r.changelog_id
                JOIN maps AS m ON m.steam_id = cl.map_id JOIN chapters AS c ON c.id = m.chapter_id
                LEFT JOIN users AS u ON u.profile_number = cl.profile_number
                LEFT JOIN users AS ru ON ru.profile_number = r.resolved_by
                LEFT JOIN coop_bundled AS cb ON cb.id = cl.coop_id
                LEFT JOIN users AS pu ON pu.profile_number = NULLIF(CASE WHEN cb.p_id1 = cl.profile_number THEN cb.p_id2 ELSE cb.p_id1 END, 'N/A')
            WHERE ($1::text IS NULL OR r.status = $1) AND ($3::bigint IS NULL OR r.id < $3)
            ORDER BY r.id DESC
            LIMIT $2
        "#,
    )
    .bind(status)
    .bind(limit)
    .bind(before)
    .fetch_all(pool)
    .await
}

pub async fn open_count(pool: &PgPool) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar("SELECT COUNT(*) FROM run_reports WHERE status = 'open'").fetch_one(pool).await
}

/// Resolves, dismisses or reopens a report. With `all_on_run`, every open report on the same
/// run gets the same answer.
pub async fn set_status(pool: &PgPool, actor: &AdminOrService, id: i64, status: &str, note: Option<&str>, all_on_run: bool) -> ActionResult<()> {
    if !["open", "resolved", "dismissed"].contains(&status) {
        return Ok(Err(Refused::Invalid("Unknown status.".into())));
    }
    let mut tx = pool.begin().await?;
    let row: Option<(i64, String)> = sqlx::query_as("SELECT changelog_id, status FROM run_reports WHERE id = $1 FOR UPDATE").bind(id).fetch_optional(&mut *tx).await?;
    let Some((cl_id, before)) = row else {
        return Ok(Err(Refused::NotFound("No such report.")));
    };
    let actor_profile = match actor {
        AdminOrService::Admin(user) => Some(user.profile_number.clone()),
        AdminOrService::Service => None,
    };
    let note = note.map(str::trim).filter(|n| !n.is_empty()).map(|n| n.chars().take(500).collect::<String>());
    let open = status == "open";
    let ids: Vec<i64> = sqlx::query_scalar(
        r#"
            UPDATE run_reports SET status = $2,
                resolved_by = CASE WHEN $2 = 'open' THEN NULL ELSE $3 END,
                resolved_at = CASE WHEN $2 = 'open' THEN NULL ELSE now() AT TIME ZONE 'utc' END,
                resolution_note = CASE WHEN $2 = 'open' THEN NULL ELSE $4 END
            WHERE id = $1 OR ($5 AND changelog_id = $6 AND status = 'open')
            RETURNING id
        "#,
    )
    .bind(id)
    .bind(status)
    .bind(&actor_profile)
    .bind(&note)
    .bind(all_on_run && !open)
    .bind(cl_id)
    .fetch_all(&mut *tx)
    .await?;
    log_action(&mut tx, actor, &format!("report.{status}"), "run", &cl_id.to_string(), note.as_deref(), json!({ "reports": ids, "before": before })).await?;
    tx.commit().await?;
    Ok(Ok(()))
}
