//! Admin actions on runs, demos and profiles. Each action runs in one transaction together
//! with its entry in the audit log (`admin_actions`), so nothing changes without a record.
//!
//! Actions on a co-op run apply to the whole run (both players' changelog entries); the
//! per-map filler entry used for partners without a run of their own is never touched.
use crate::tools::auth::AdminOrService;
use serde_json::{json, Value};
use sqlx::{FromRow, PgPool, Postgres, Transaction};

/// The co-op filler user (see db/dbscript/import_boards.py).
pub const FILLER: &str = "N/A";
/// The two halves of a co-op run may be logged a few centiseconds apart.
const COOP_SCORE_TOLERANCE: i32 = 3;

/// An entry in the audit log, with the acting admin's name.
#[derive(Debug, Serialize, FromRow)]
pub struct AdminAction {
    pub id: i64,
    pub admin_profile: Option<String>,
    pub admin_name: Option<String>,
    pub via_service: bool,
    pub action: String,
    pub target_type: String,
    pub target_id: String,
    pub reason: Option<String>,
    pub details: Option<String>,
    pub created_at: chrono::NaiveDateTime,
    /// The run acted on (for run and co-op actions; deleted runs come from the saved copy).
    pub run_id: Option<i64>,
    pub map_id: Option<String>,
    pub map_name: Option<String>,
    pub game_id: Option<i32>,
    pub score: Option<i32>,
    pub post_rank: Option<i32>,
    pub player: Option<String>,
    pub player_name: Option<String>,
    pub partner: Option<String>,
    pub partner_name: Option<String>,
    /// Whether the run still exists.
    pub run_exists: bool,
    /// Whether the run is currently hidden from the boards (null if it no longer exists).
    pub run_banned: Option<bool>,
    /// Whether the run is currently removed from the WR history.
    pub run_wr_hidden: Option<bool>,
}

/// Filters for [list_actions].
#[derive(Debug, Deserialize, Default)]
pub struct AuditQuery {
    pub limit: Option<i64>,
    /// Only entries older than this id (for paging).
    pub before: Option<i64>,
    pub admin: Option<String>,
    pub target_type: Option<String>,
    pub target_id: Option<String>,
    pub action: Option<String>,
    /// "runs" (run and co-op actions) or "profiles".
    pub kind: Option<String>,
}

/// Why an action was refused (shown to the admin).
#[derive(Debug)]
pub enum Refused {
    NotFound(&'static str),
    Invalid(String),
}

pub type ActionResult<T> = Result<Result<T, Refused>, sqlx::Error>;

fn actor_profile(actor: &AdminOrService) -> Option<&str> {
    match actor {
        AdminOrService::Admin(user) => Some(user.profile_number.as_str()),
        AdminOrService::Service => None,
    }
}

async fn log_action(
    tx: &mut Transaction<'_, Postgres>,
    actor: &AdminOrService,
    action: &str,
    target_type: &str,
    target_id: &str,
    reason: Option<&str>,
    details: Value,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
            INSERT INTO admin_actions (admin_profile, via_service, action, target_type, target_id, reason, details)
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        "#,
    )
    .bind(actor_profile(actor))
    .bind(matches!(actor, AdminOrService::Service))
    .bind(action)
    .bind(target_type)
    .bind(target_id)
    .bind(reason.map(|r| r.chars().take(500).collect::<String>()))
    .bind(details.to_string())
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// Records an action by a signed-in user (not through [AdminOrService]), e.g. a run an admin
/// entered by hand.
pub async fn log_by_user(pool: &PgPool, profile_number: &str, action: &str, target_type: &str, target_id: &str, details: Value) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO admin_actions (admin_profile, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5::jsonb)")
        .bind(profile_number)
        .bind(action)
        .bind(target_type)
        .bind(target_id)
        .bind(details.to_string())
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn list_actions(pool: &PgPool, q: &AuditQuery) -> Result<Vec<AdminAction>, sqlx::Error> {
    sqlx::query_as::<_, AdminAction>(
        r#"
            WITH page AS (
                SELECT a.*,
                    -- The run an action is about: the target run, or the first run of a co-op pair.
                    CASE
                        WHEN a.target_type = 'run' AND a.target_id ~ '^[0-9]+$' THEN a.target_id::bigint
                        WHEN a.target_type = 'coop' AND a.target_id ~ '^[0-9]+$' THEN (SELECT cl_id1 FROM coop_bundled WHERE id = a.target_id::bigint)
                    END AS run_id,
                    a.details -> 'runs' -> 0 AS deleted
                FROM admin_actions AS a
                WHERE ($1::bigint IS NULL OR a.id < $1)
                  AND ($2::text IS NULL OR a.admin_profile = $2)
                  AND ($3::text IS NULL OR a.target_type = $3)
                  AND ($4::text IS NULL OR a.target_id = $4)
                  AND ($5::text IS NULL OR a.action = $5)
                  AND ($7::text IS NULL
                       OR ($7 = 'runs' AND a.target_type IN ('run', 'coop'))
                       OR ($7 = 'profiles' AND a.target_type = 'profile'))
                ORDER BY a.id DESC
                LIMIT $6
            )
            SELECT p.id, p.admin_profile, COALESCE(u.board_name, u.steam_name, p.admin_profile) AS admin_name,
                   p.via_service, p.action, p.target_type, p.target_id, p.reason, p.details::text AS details, p.created_at,
                   p.run_id,
                   COALESCE(cl.map_id, p.deleted ->> 'map_id') AS map_id,
                   m.name AS map_name, c.game_id,
                   COALESCE(cl.score, (p.deleted ->> 'score')::int) AS score,
                   COALESCE(cl.post_rank, (p.deleted ->> 'post_rank')::int) AS post_rank,
                   COALESCE(cl.profile_number, p.deleted ->> 'profile_number') AS player,
                   COALESCE(pu.board_name, pu.steam_name, cl.profile_number, p.deleted ->> 'profile_number') AS player_name,
                   NULLIF(CASE WHEN cb.p_id1 = cl.profile_number THEN cb.p_id2 ELSE cb.p_id1 END, 'N/A') AS partner,
                   COALESCE(ou.board_name, ou.steam_name, ou.profile_number) AS partner_name,
                   cl.id IS NOT NULL AS run_exists,
                   cl.banned AS run_banned,
                   cl.wr_hidden AS run_wr_hidden
            FROM page AS p
            LEFT JOIN users AS u ON u.profile_number = p.admin_profile
            LEFT JOIN changelog AS cl ON cl.id = p.run_id
            LEFT JOIN maps AS m ON m.steam_id = COALESCE(cl.map_id, p.deleted ->> 'map_id')
            LEFT JOIN chapters AS c ON c.id = m.chapter_id
            LEFT JOIN users AS pu ON pu.profile_number = COALESCE(cl.profile_number, p.deleted ->> 'profile_number')
            LEFT JOIN coop_bundled AS cb ON cb.id = cl.coop_id
            LEFT JOIN users AS ou ON ou.profile_number = NULLIF(CASE WHEN cb.p_id1 = cl.profile_number THEN cb.p_id2 ELSE cb.p_id1 END, 'N/A')
            ORDER BY p.id DESC
        "#,
    )
    .bind(q.before)
    .bind(q.admin.as_deref())
    .bind(q.target_type.as_deref())
    .bind(q.target_id.as_deref())
    .bind(q.action.as_deref())
    .bind(q.limit.unwrap_or(50).clamp(1, 200))
    .bind(q.kind.as_deref())
    .fetch_all(pool)
    .await
}

#[derive(Debug, FromRow)]
struct RunRow {
    id: i64,
    profile_number: String,
    map_id: String,
    score: i32,
    timestamp: Option<chrono::NaiveDateTime>,
    coop_id: Option<i64>,
    is_coop: bool,
}

async fn run_row(tx: &mut Transaction<'_, Postgres>, cl_id: i64) -> Result<Option<RunRow>, sqlx::Error> {
    sqlx::query_as::<_, RunRow>(
        r#"
            SELECT cl.id, cl.profile_number, cl.map_id, cl.score, cl.timestamp, cl.coop_id, c.is_multiplayer AS is_coop
            FROM changelog AS cl
            JOIN maps AS m ON m.steam_id = cl.map_id
            JOIN chapters AS c ON c.id = m.chapter_id
            WHERE cl.id = $1
            FOR UPDATE OF cl
        "#,
    )
    .bind(cl_id)
    .fetch_optional(&mut **tx)
    .await
}

/// The changelog ids making up the run: both players' entries of a co-op run (fillers excluded).
async fn run_halves(tx: &mut Transaction<'_, Postgres>, run: &RunRow) -> Result<Vec<i64>, sqlx::Error> {
    let Some(coop_id) = run.coop_id else {
        return Ok(vec![run.id]);
    };
    let ids: Vec<i64> = sqlx::query_scalar(
        r#"
            SELECT cl.id FROM coop_bundled AS cb
            JOIN changelog AS cl ON cl.id IN (cb.cl_id1, cb.cl_id2)
            WHERE cb.id = $1 AND cl.profile_number <> $2
        "#,
    )
    .bind(coop_id)
    .bind(FILLER)
    .fetch_all(&mut **tx)
    .await?;
    Ok(if ids.contains(&run.id) { ids } else { vec![run.id] })
}

/// Loads the run for an action, refusing filler entries.
async fn target_run(tx: &mut Transaction<'_, Postgres>, cl_id: i64) -> Result<Result<RunRow, Refused>, sqlx::Error> {
    match run_row(tx, cl_id).await? {
        None => Ok(Err(Refused::NotFound("No such run."))),
        Some(run) if run.profile_number == FILLER => Ok(Err(Refused::Invalid("That entry is a co-op placeholder, not a run.".into()))),
        Some(run) => Ok(Ok(run)),
    }
}

/// The affected run's map and whether it's co-op, for cache refreshes.
pub struct Touched {
    pub map_id: String,
    pub is_coop: bool,
    pub ids: Vec<i64>,
}

/// Hides a run from the boards (banned) or restores it.
pub async fn set_run_banned(pool: &PgPool, actor: &AdminOrService, cl_id: i64, banned: bool, reason: Option<&str>) -> ActionResult<Touched> {
    let mut tx = pool.begin().await?;
    let run = match target_run(&mut tx, cl_id).await? {
        Ok(run) => run,
        Err(refused) => return Ok(Err(refused)),
    };
    let ids = run_halves(&mut tx, &run).await?;
    sqlx::query("UPDATE changelog SET banned = $2 WHERE id = ANY($1)").bind(&ids).bind(banned).execute(&mut *tx).await?;
    let action = if banned { "run.ban" } else { "run.unban" };
    log_action(&mut tx, actor, action, "run", &cl_id.to_string(), reason, json!({ "changelog_ids": ids, "map_id": run.map_id, "score": run.score })).await?;
    tx.commit().await?;
    Ok(Ok(Touched { map_id: run.map_id, is_coop: run.is_coop, ids }))
}

/// Verifies a pending run (or marks it pending again), both halves of a co-op run.
pub async fn set_run_verified(pool: &PgPool, actor: &AdminOrService, cl_id: i64, verified: bool, reason: Option<&str>) -> ActionResult<Touched> {
    let mut tx = pool.begin().await?;
    let run = match target_run(&mut tx, cl_id).await? {
        Ok(run) => run,
        Err(refused) => return Ok(Err(refused)),
    };
    let ids = run_halves(&mut tx, &run).await?;
    sqlx::query("UPDATE changelog SET verified = $2 WHERE id = ANY($1)").bind(&ids).bind(verified).execute(&mut *tx).await?;
    let action = if verified { "run.verify" } else { "run.unverify" };
    log_action(&mut tx, actor, action, "run", &cl_id.to_string(), reason, json!({ "changelog_ids": ids, "map_id": run.map_id, "score": run.score })).await?;
    tx.commit().await?;
    Ok(Ok(Touched { map_id: run.map_id, is_coop: run.is_coop, ids }))
}

/// Deletes a run (both halves of a co-op run) and what hangs off it: its co-op pairing,
/// mtrigger entries, old-board id mapping and demo rows. The audit log keeps the full rows.
pub async fn delete_run(pool: &PgPool, actor: &AdminOrService, cl_id: i64, reason: Option<&str>) -> ActionResult<Touched> {
    let mut tx = pool.begin().await?;
    let run = match target_run(&mut tx, cl_id).await? {
        Ok(run) => run,
        Err(refused) => return Ok(Err(refused)),
    };
    let ids = run_halves(&mut tx, &run).await?;
    let rows: Vec<String> = sqlx::query_scalar("SELECT to_jsonb(cl)::text FROM changelog AS cl WHERE id = ANY($1)")
        .bind(&ids)
        .fetch_all(&mut *tx)
        .await?;
    let bundle: Option<String> = match run.coop_id {
        Some(coop_id) => sqlx::query_scalar("SELECT to_jsonb(cb)::text FROM coop_bundled AS cb WHERE id = $1").bind(coop_id).fetch_optional(&mut *tx).await?,
        None => None,
    };
    if let Some(coop_id) = run.coop_id {
        sqlx::query("UPDATE changelog SET coop_id = NULL WHERE coop_id = $1").bind(coop_id).execute(&mut *tx).await?;
        sqlx::query("DELETE FROM coop_bundled WHERE id = $1").bind(coop_id).execute(&mut *tx).await?;
    }
    let demo_ids: Vec<i64> = sqlx::query_scalar("SELECT demo_id FROM changelog WHERE id = ANY($1) AND demo_id IS NOT NULL").bind(&ids).fetch_all(&mut *tx).await?;
    sqlx::query("UPDATE changelog SET demo_id = NULL WHERE id = ANY($1)").bind(&ids).execute(&mut *tx).await?;
    sqlx::query("UPDATE changelog SET previous_id = NULL WHERE previous_id = ANY($1)").bind(&ids).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM demos WHERE cl_id = ANY($1) OR (id = ANY($2) AND NOT EXISTS (SELECT 1 FROM changelog WHERE demo_id = demos.id))")
        .bind(&ids)
        .bind(&demo_ids)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM mtrigger_entries WHERE changelog_id = ANY($1)").bind(&ids).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM legacy_changelog_ids WHERE changelog_id = ANY($1)").bind(&ids).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM changelog WHERE id = ANY($1)").bind(&ids).execute(&mut *tx).await?;
    let rows: Vec<Value> = rows.iter().filter_map(|r| serde_json::from_str(r).ok()).collect();
    let bundle: Option<Value> = bundle.and_then(|b| serde_json::from_str(&b).ok());
    log_action(&mut tx, actor, "run.delete", "run", &cl_id.to_string(), reason, json!({ "runs": rows, "coop_bundle": bundle })).await?;
    tx.commit().await?;
    Ok(Ok(Touched { map_id: run.map_id, is_coop: run.is_coop, ids }))
}

/// Removes the demo(s) from a run. The demo files themselves stay in storage.
pub async fn remove_demo(pool: &PgPool, actor: &AdminOrService, cl_id: i64, reason: Option<&str>) -> ActionResult<Touched> {
    let mut tx = pool.begin().await?;
    let run = match target_run(&mut tx, cl_id).await? {
        Ok(run) => run,
        Err(refused) => return Ok(Err(refused)),
    };
    let ids = run_halves(&mut tx, &run).await?;
    let demos: Vec<String> = sqlx::query_scalar(
        "SELECT to_jsonb(d)::text FROM demos AS d WHERE d.id IN (SELECT demo_id FROM changelog WHERE id = ANY($1)) OR d.cl_id = ANY($1)",
    )
    .bind(&ids)
    .fetch_all(&mut *tx)
    .await?;
    if demos.is_empty() {
        return Ok(Err(Refused::Invalid("This run has no demo.".into())));
    }
    let demo_ids: Vec<i64> = sqlx::query_scalar("SELECT demo_id FROM changelog WHERE id = ANY($1) AND demo_id IS NOT NULL").bind(&ids).fetch_all(&mut *tx).await?;
    sqlx::query("UPDATE changelog SET demo_id = NULL WHERE id = ANY($1)").bind(&ids).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM demos WHERE cl_id = ANY($1) OR (id = ANY($2) AND NOT EXISTS (SELECT 1 FROM changelog WHERE demo_id = demos.id))")
        .bind(&ids)
        .bind(&demo_ids)
        .execute(&mut *tx)
        .await?;
    let demos: Vec<Value> = demos.iter().filter_map(|d| serde_json::from_str(d).ok()).collect();
    log_action(&mut tx, actor, "demo.remove", "run", &cl_id.to_string(), reason, json!({ "changelog_ids": ids, "demos": demos })).await?;
    tx.commit().await?;
    Ok(Ok(Touched { map_id: run.map_id, is_coop: run.is_coop, ids }))
}

/// Freezes or unfreezes a profile: frozen profiles keep their times but can't get new ones.
pub async fn set_frozen(pool: &PgPool, actor: &AdminOrService, profile_number: &str, frozen: bool, reason: Option<&str>) -> ActionResult<()> {
    let mut tx = pool.begin().await?;
    let updated = sqlx::query("UPDATE users SET frozen = $2, frozen_reason = CASE WHEN $2 THEN $3 ELSE NULL END WHERE profile_number = $1 AND profile_number <> $4")
        .bind(profile_number)
        .bind(frozen)
        .bind(reason)
        .bind(FILLER)
        .execute(&mut *tx)
        .await?;
    if updated.rows_affected() == 0 {
        return Ok(Err(Refused::NotFound("No such player.")));
    }
    let action = if frozen { "profile.freeze" } else { "profile.unfreeze" };
    log_action(&mut tx, actor, action, "profile", profile_number, reason, json!({})).await?;
    tx.commit().await?;
    Ok(Ok(()))
}

/// Bans or unbans a profile: a banned player's runs are hidden from every board and the player
/// is listed on the Wall of Shame. Staff must lose their role before they can be banned.
/// Returns the maps the player has runs on (map id, co-op), whose ranks need rebuilding.
pub async fn set_profile_banned(pool: &PgPool, actor: &AdminOrService, profile_number: &str, banned: bool, reason: Option<&str>) -> ActionResult<Vec<(String, bool)>> {
    let mut tx = pool.begin().await?;
    let target: Option<(bool, Option<String>)> = sqlx::query_as("SELECT banned, role FROM users WHERE profile_number = $1 AND profile_number <> $2 FOR UPDATE")
        .bind(profile_number)
        .bind(FILLER)
        .fetch_optional(&mut *tx)
        .await?;
    let Some((was_banned, role)) = target else {
        return Ok(Err(Refused::NotFound("No such player.")));
    };
    if banned {
        if let AdminOrService::Admin(user) = actor {
            if user.profile_number == profile_number {
                return Ok(Err(Refused::Invalid("You can't ban yourself.".into())));
            }
        }
        if role.is_some() {
            return Ok(Err(Refused::Invalid("Remove this player's staff role before banning them.".into())));
        }
    }
    if was_banned == banned {
        return Ok(Err(Refused::Invalid(if banned { "This player is already banned.".into() } else { "This player isn't banned.".into() })));
    }
    sqlx::query("UPDATE users SET banned = $2 WHERE profile_number = $1").bind(profile_number).bind(banned).execute(&mut *tx).await?;
    // Sessions end on ban, so a banned player is signed out everywhere.
    if banned {
        sqlx::query("DELETE FROM sessions WHERE profile_number = $1").bind(profile_number).execute(&mut *tx).await?;
    }
    let maps: Vec<(String, bool)> = sqlx::query_as(
        r#"
            SELECT DISTINCT cl.map_id, c.is_multiplayer FROM changelog AS cl
            JOIN maps AS m ON m.steam_id = cl.map_id JOIN chapters AS c ON c.id = m.chapter_id
            WHERE cl.profile_number = $1
        "#,
    )
    .bind(profile_number)
    .fetch_all(&mut *tx)
    .await?;
    let action = if banned { "profile.ban" } else { "profile.unban" };
    log_action(&mut tx, actor, action, "profile", profile_number, reason, json!({ "maps": maps.len() })).await?;
    tx.commit().await?;
    Ok(Ok(maps))
}

/// Whether a profile is frozen (and so can't get new times).
pub async fn is_frozen(pool: &PgPool, profile_number: &str) -> Result<bool, sqlx::Error> {
    Ok(sqlx::query_scalar::<_, bool>("SELECT frozen FROM users WHERE profile_number = $1")
        .bind(profile_number)
        .fetch_optional(pool)
        .await?
        .unwrap_or(false))
}

/// Records which player of a co-op run hosted (played blue); `host` None = unknown.
pub async fn set_host(pool: &PgPool, actor: &AdminOrService, coop_id: i64, host: Option<&str>) -> ActionResult<()> {
    let mut tx = pool.begin().await?;
    let before: Option<Option<bool>> = sqlx::query_scalar("SELECT p1_is_host FROM coop_bundled WHERE id = $1 FOR UPDATE").bind(coop_id).fetch_optional(&mut *tx).await?;
    let Some(before) = before else {
        return Ok(Err(Refused::NotFound("No such co-op run.")));
    };
    let res = sqlx::query(
        r#"
            UPDATE coop_bundled
            SET p1_is_host = CASE WHEN $2::text IS NULL THEN NULL ELSE p_id1 = $2 END
            WHERE id = $1 AND ($2::text IS NULL OR $2 IN (p_id1, p_id2))
        "#,
    )
    .bind(coop_id)
    .bind(host)
    .execute(&mut *tx)
    .await?;
    if res.rows_affected() == 0 {
        return Ok(Err(Refused::Invalid("The host must be one of the run's players.".into())));
    }
    log_action(&mut tx, actor, "coop.set_host", "coop", &coop_id.to_string(), None, json!({ "before_p1_is_host": before, "host": host })).await?;
    tx.commit().await?;
    Ok(Ok(()))
}

#[derive(Debug, FromRow)]
struct Bundle {
    id: i64,
    p_id1: String,
    p_id2: Option<String>,
    cl_id1: i64,
    cl_id2: Option<i64>,
}

async fn bundle(tx: &mut Transaction<'_, Postgres>, id: i64) -> Result<Option<Bundle>, sqlx::Error> {
    sqlx::query_as::<_, Bundle>("SELECT id, p_id1, p_id2, cl_id1, cl_id2 FROM coop_bundled WHERE id = $1 FOR UPDATE")
        .bind(id)
        .fetch_optional(&mut **tx)
        .await
}

/// Gives a run that's losing its partner a solo pairing (partner unknown), so it stays on the board.
pub async fn pair_with_filler(tx: &mut Transaction<'_, Postgres>, cl_id: i64, profile_number: &str, filler_id: i64) -> Result<(), sqlx::Error> {
    let id: i64 = sqlx::query_scalar("INSERT INTO coop_bundled (p_id1, p_id2, cl_id1, cl_id2) VALUES ($1, $2, $3, $4) RETURNING id")
        .bind(profile_number)
        .bind(FILLER)
        .bind(cl_id)
        .bind(filler_id)
        .fetch_one(&mut **tx)
        .await?;
    sqlx::query("UPDATE changelog SET coop_id = $2 WHERE id = $1").bind(cl_id).bind(id).execute(&mut **tx).await?;
    Ok(())
}

/// Sets the partner of a co-op run to the player with `partner` SteamID. The partner's own
/// matching run (same map, same score within a few centiseconds, nearest in time) is paired
/// with it when they have one; otherwise they're recorded without a run. A run that loses
/// its previous partner this way keeps its place on the board, paired with nobody.
/// The partner must already exist as a user (see [crate::models::users::Users]).
pub async fn set_partner(pool: &PgPool, actor: &AdminOrService, cl_id: i64, partner: &str, reason: Option<&str>) -> ActionResult<Touched> {
    let mut tx = pool.begin().await?;
    let (touched, details) = match pair_partner(&mut tx, cl_id, partner).await? {
        Ok(done) => done,
        Err(refused) => return Ok(Err(refused)),
    };
    log_action(&mut tx, actor, "coop.set_partner", "run", &cl_id.to_string(), reason, details).await?;
    tx.commit().await?;
    Ok(Ok(touched))
}

/// The pairing behind [set_partner], inside the caller's transaction and without an audit
/// entry (also used for new co-op submissions). Returns what changed, for the audit log.
pub async fn pair_partner(tx: &mut Transaction<'_, Postgres>, cl_id: i64, partner: &str) -> Result<Result<(Touched, Value), Refused>, sqlx::Error> {
    let run = match target_run(tx, cl_id).await? {
        Ok(run) => run,
        Err(refused) => return Ok(Err(refused)),
    };
    if !run.is_coop {
        return Ok(Err(Refused::Invalid("That's a singleplayer run.".into())));
    }
    if run.profile_number == partner {
        return Ok(Err(Refused::Invalid("A player can't be their own partner.".into())));
    }
    let filler_id: Option<i64> = sqlx::query_scalar("SELECT id FROM changelog WHERE profile_number = $1 AND map_id = $2 ORDER BY id LIMIT 1")
        .bind(FILLER)
        .bind(&run.map_id)
        .fetch_optional(&mut **tx)
        .await?;
    let Some(filler_id) = filler_id else {
        return Ok(Err(Refused::Invalid("This map has no co-op placeholder entry.".into())));
    };

    // The partner's own run of this, unless it's already paired with someone else.
    let partner_run: Option<(i64, Option<i64>)> = sqlx::query_as(
        r#"
            SELECT cl.id, cl.coop_id FROM changelog AS cl
            LEFT JOIN coop_bundled AS cb ON cb.id = cl.coop_id
            WHERE cl.profile_number = $1 AND cl.map_id = $2 AND NOT cl.banned
              AND abs(cl.score - $3) <= $5
              AND (cl.coop_id IS NULL OR cl.coop_id = $6
                   OR COALESCE(NULLIF(cb.p_id2, cl.profile_number), cb.p_id1) IN ($7, $4))
            ORDER BY abs(cl.score - $3), abs(extract(epoch FROM cl.timestamp - $8)) NULLS LAST
            LIMIT 1
        "#,
    )
    .bind(partner)
    .bind(&run.map_id)
    .bind(run.score)
    .bind(&run.profile_number)
    .bind(COOP_SCORE_TOLERANCE)
    .bind(run.coop_id.unwrap_or(-1))
    .bind(FILLER)
    .bind(run.timestamp)
    .fetch_optional(&mut **tx)
    .await?;

    let before = match run.coop_id {
        Some(id) => bundle(tx, id).await?,
        None => None,
    };
    let partner_cl = partner_run.map(|(id, _)| id);
    // Free the partner's run from its current (solo) pairing.
    if let Some((pid, Some(pcoop))) = partner_run {
        if Some(pcoop) != run.coop_id {
            sqlx::query("UPDATE changelog SET coop_id = NULL WHERE coop_id = $1").bind(pcoop).execute(&mut **tx).await?;
            sqlx::query("DELETE FROM coop_bundled WHERE id = $1").bind(pcoop).execute(&mut **tx).await?;
            let _ = pid;
        }
    }

    let coop_id = match &before {
        Some(b) => {
            // Our run's slot stays; the other slot gets the new partner.
            let ours_first = b.cl_id1 == run.id;
            let (old_partner, old_partner_cl) = if ours_first { (b.p_id2.clone(), b.cl_id2) } else { (Some(b.p_id1.clone()), Some(b.cl_id1)) };
            let new_cl = partner_cl.unwrap_or(filler_id);
            if ours_first {
                sqlx::query("UPDATE coop_bundled SET p_id2 = $2, cl_id2 = $3, p1_is_host = NULL WHERE id = $1").bind(b.id).bind(partner).bind(new_cl).execute(&mut **tx).await?;
            } else {
                sqlx::query("UPDATE coop_bundled SET p_id1 = $2, cl_id1 = $3, p1_is_host = NULL WHERE id = $1").bind(b.id).bind(partner).bind(new_cl).execute(&mut **tx).await?;
            }
            // The previous partner's own run (if any, and not the new one) keeps a place on the board.
            if let (Some(op), Some(ocl)) = (old_partner, old_partner_cl) {
                if op != FILLER && Some(ocl) != partner_cl && ocl != filler_id {
                    sqlx::query("UPDATE changelog SET coop_id = NULL WHERE id = $1").bind(ocl).execute(&mut **tx).await?;
                    pair_with_filler(tx, ocl, &op, filler_id).await?;
                }
            }
            b.id
        }
        None => {
            let id: i64 = sqlx::query_scalar("INSERT INTO coop_bundled (p_id1, p_id2, cl_id1, cl_id2) VALUES ($1, $2, $3, $4) RETURNING id")
                .bind(&run.profile_number)
                .bind(partner)
                .bind(run.id)
                .bind(partner_cl.unwrap_or(filler_id))
                .fetch_one(&mut **tx)
                .await?;
            sqlx::query("UPDATE changelog SET coop_id = $2 WHERE id = $1").bind(run.id).bind(id).execute(&mut **tx).await?;
            id
        }
    };
    if let Some(pcl) = partner_cl {
        sqlx::query("UPDATE changelog SET coop_id = $2 WHERE id = $1").bind(pcl).bind(coop_id).execute(&mut **tx).await?;
    }
    let before = before.map(|b| json!({ "id": b.id, "p_id1": b.p_id1, "p_id2": b.p_id2, "cl_id1": b.cl_id1, "cl_id2": b.cl_id2 }));
    let details = json!({ "partner": partner, "partner_run": partner_cl, "coop_id": coop_id, "before": before });
    Ok(Ok((Touched { map_id: run.map_id, is_coop: true, ids: vec![run.id] }, details)))
}

/// Removes a run from its map's world-record history, or puts it back. The run itself (and
/// its place on the board) is unaffected. Applies to both halves of a co-op run.
pub async fn set_wr_hidden(pool: &PgPool, actor: &AdminOrService, cl_id: i64, hidden: bool, reason: Option<&str>) -> ActionResult<Touched> {
    let mut tx = pool.begin().await?;
    let run = match target_run(&mut tx, cl_id).await? {
        Ok(run) => run,
        Err(refused) => return Ok(Err(refused)),
    };
    let ids = run_halves(&mut tx, &run).await?;
    sqlx::query("UPDATE changelog SET wr_hidden = $2 WHERE id = ANY($1)").bind(&ids).bind(hidden).execute(&mut *tx).await?;
    let action = if hidden { "run.hide_wr" } else { "run.show_wr" };
    log_action(&mut tx, actor, action, "run", &cl_id.to_string(), reason, json!({ "changelog_ids": ids, "map_id": run.map_id, "score": run.score })).await?;
    tx.commit().await?;
    Ok(Ok(Touched { map_id: run.map_id, is_coop: run.is_coop, ids }))
}

/// Staff tiers a player can have.
pub const ROLES: [&str; 3] = ["verifier", "moderator", "admin"];

/// Sets a player's staff tier (`None` removes it).
pub async fn set_role(pool: &PgPool, actor: &AdminOrService, profile_number: &str, role: Option<&str>, reason: Option<&str>) -> ActionResult<()> {
    if role.is_some_and(|r| !ROLES.contains(&r)) {
        return Ok(Err(Refused::Invalid("Role must be verifier, moderator or admin.".into())));
    }
    if let (AdminOrService::Admin(me), None) = (actor, role) {
        if me.profile_number == profile_number {
            return Ok(Err(Refused::Invalid("You can't remove your own role.".into())));
        }
    }
    let mut tx = pool.begin().await?;
    let before: Option<Option<String>> = sqlx::query_scalar("SELECT role FROM users WHERE profile_number = $1 AND profile_number <> $2 FOR UPDATE")
        .bind(profile_number)
        .bind(FILLER)
        .fetch_optional(&mut *tx)
        .await?;
    let Some(before) = before else {
        return Ok(Err(Refused::NotFound("No such player.")));
    };
    sqlx::query("UPDATE users SET role = $2 WHERE profile_number = $1").bind(profile_number).bind(role).execute(&mut *tx).await?;
    log_action(&mut tx, actor, "profile.set_role", "profile", profile_number, reason, json!({ "before": before, "role": role })).await?;
    tx.commit().await?;
    Ok(Ok(()))
}
