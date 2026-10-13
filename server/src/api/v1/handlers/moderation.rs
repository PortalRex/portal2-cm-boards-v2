//! Admin endpoints (signed-in admins, or the board's services). Every change is written to
//! the audit log; `GET /admin/audit` reads it.
use crate::{
    controllers::moderation::{self, AuditQuery, Refused, Touched},
    models::users::Users,
    tools::{
        auth::AdminOrService,
        cache::{CacheState, COOP_PREVIEWS, SP_PREVIEWS},
        points_cache::invalidate_points,
        config::Config,
        error::Result,
    },
};
use actix_web::{delete, get, put, web, HttpResponse, Responder};
use sqlx::PgPool;

#[derive(Deserialize, Default)]
pub struct Reason {
    pub reason: Option<String>,
}

#[derive(Deserialize)]
pub struct BanBody {
    pub banned: bool,
    pub reason: Option<String>,
}

#[derive(Deserialize)]
pub struct FreezeBody {
    pub frozen: bool,
    pub reason: Option<String>,
}

#[derive(Deserialize)]
pub struct PartnerBody {
    pub steam_id: String,
    pub reason: Option<String>,
}

fn refused(r: Refused) -> HttpResponse {
    match r {
        Refused::NotFound(msg) => HttpResponse::NotFound().body(msg),
        Refused::Invalid(msg) => HttpResponse::BadRequest().body(msg),
    }
}

fn reason(r: &Option<String>) -> Option<&str> {
    r.as_deref().map(str::trim).filter(|s| !s.is_empty())
}

/// Refreshes the cached previews and rank cache of the map a run action touched.
async fn refresh(cache: &CacheState, pool: &PgPool, config: &Config, touched: &Touched) {
    cache.update_current_state(if touched.is_coop { COOP_PREVIEWS } else { SP_PREVIEWS }, false).await;
    if cache.default_cat_ids.contains_key(&touched.map_id) {
        cache.reload_rank(pool, &touched.map_id, config, touched.is_coop).await;
    }
}

async fn respond(result: moderation::ActionResult<Touched>, cache: &CacheState, pool: &PgPool, config: &Config) -> Result<HttpResponse> {
    Ok(match result? {
        Ok(touched) => {
            refresh(cache, pool, config, &touched).await;
            invalidate_points().await;
            HttpResponse::Ok().json(serde_json::json!({ "changelog_ids": touched.ids }))
        }
        Err(r) => refused(r),
    })
}

/// **GET** The admin audit log, newest first. Filters: `admin`, `target_type`, `target_id`,
/// `action`; page with `before=<id>`; `limit` (default 50, max 200).
#[get("/admin/audit")]
async fn admin_audit(_auth: AdminOrService, pool: web::Data<PgPool>, query: web::Query<AuditQuery>) -> Result<impl Responder> {
    Ok(web::Json(moderation::list_actions(pool.get_ref(), &query).await?))
}

/// **PUT** Hide a run from the boards (`{"banned": true}`) or restore it. Applies to both
/// halves of a co-op run.
#[put("/admin/runs/{id}/banned")]
async fn admin_run_banned(
    auth: AdminOrService,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    cache: web::Data<CacheState>,
    id: web::Path<i64>,
    body: web::Json<BanBody>,
) -> Result<impl Responder> {
    let result = moderation::set_run_banned(pool.get_ref(), &auth, id.into_inner(), body.banned, reason(&body.reason)).await;
    respond(result, &cache, &pool, &config).await
}

#[derive(Deserialize)]
pub struct VerifyBody {
    pub verified: bool,
    pub reason: Option<String>,
}

/// **PUT** Verify a pending run (`{"verified": true}`) or mark it pending again. Any staff tier.
#[put("/admin/runs/{id}/verified")]
async fn admin_run_verified(
    auth: AdminOrService,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    cache: web::Data<CacheState>,
    id: web::Path<i64>,
    body: web::Json<VerifyBody>,
) -> Result<impl Responder> {
    let result = moderation::set_run_verified(pool.get_ref(), &auth, id.into_inner(), body.verified, reason(&body.reason)).await;
    respond(result, &cache, &pool, &config).await
}

/// **DELETE** Delete a run permanently (both halves of a co-op run). Optional body `{"reason": ...}`.
#[delete("/admin/runs/{id}")]
async fn admin_run_delete(
    auth: AdminOrService,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    cache: web::Data<CacheState>,
    id: web::Path<i64>,
    body: Option<web::Json<Reason>>,
) -> Result<impl Responder> {
    let body = body.map(|b| b.into_inner()).unwrap_or_default();
    let result = moderation::delete_run(pool.get_ref(), &auth, id.into_inner(), reason(&body.reason)).await;
    respond(result, &cache, &pool, &config).await
}

/// **DELETE** Remove a run's demo. Optional body `{"reason": ...}`.
#[delete("/admin/runs/{id}/demo")]
async fn admin_run_demo_delete(
    auth: AdminOrService,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    cache: web::Data<CacheState>,
    id: web::Path<i64>,
    body: Option<web::Json<Reason>>,
) -> Result<impl Responder> {
    let body = body.map(|b| b.into_inner()).unwrap_or_default();
    let result = moderation::remove_demo(pool.get_ref(), &auth, id.into_inner(), reason(&body.reason)).await;
    respond(result, &cache, &pool, &config).await
}

/// **PUT** Set a co-op run's partner by SteamID (`{"steam_id": "7656119..."}`). Players
/// without an account are added from the Steam Web API.
#[put("/admin/runs/{id}/partner")]
async fn admin_run_partner(
    auth: AdminOrService,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    cache: web::Data<CacheState>,
    id: web::Path<i64>,
    body: web::Json<PartnerBody>,
) -> Result<impl Responder> {
    let steam_id = body.steam_id.trim();
    if steam_id.len() != 17 || !steam_id.bytes().all(|b| b.is_ascii_digit()) || !steam_id.starts_with("7656119") {
        return Ok(HttpResponse::BadRequest().body("Enter a SteamID64 (17 digits, starting 7656119)."));
    }
    if Users::get_user(pool.get_ref(), steam_id.to_string()).await?.is_none() {
        match Users::new_from_steam(&config.steam.api_key, steam_id).await {
            Ok(user) => {
                Users::insert_new_users(pool.get_ref(), user).await?;
            }
            Err(_) => return Ok(HttpResponse::BadRequest().body("No Steam account found for that SteamID.")),
        }
    }
    let result = moderation::set_partner(pool.get_ref(), &auth, id.into_inner(), steam_id, reason(&body.reason)).await;
    respond(result, &cache, &pool, &config).await
}

/// **PUT** Freeze a profile (`{"frozen": true, "reason": ...}`): its times stay on the boards
/// but it can't get new ones. `{"frozen": false}` unfreezes.
#[put("/admin/users/{profile_number}/freeze")]
async fn admin_user_freeze(auth: AdminOrService, pool: web::Data<PgPool>, profile_number: web::Path<String>, body: web::Json<FreezeBody>) -> Result<impl Responder> {
    Ok(match moderation::set_frozen(pool.get_ref(), &auth, &profile_number, body.frozen, reason(&body.reason)).await? {
        Ok(()) => HttpResponse::NoContent().finish(),
        Err(r) => refused(r),
    })
}

/// **PUT** Ban a profile (`{"banned": true, "reason": ...}`): all of the player's runs leave the
/// boards and they're signed out. `{"banned": false}` unbans. Moderators and admins only.
#[put("/admin/users/{profile_number}/banned")]
async fn admin_user_banned(
    auth: AdminOrService,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    cache: web::Data<CacheState>,
    profile_number: web::Path<String>,
    body: web::Json<BanBody>,
) -> Result<impl Responder> {
    if let AdminOrService::Admin(user) = &auth {
        if !matches!(user.role.as_deref(), Some("moderator" | "admin")) {
            return Ok(HttpResponse::Forbidden().body("Only moderators and admins can ban players."));
        }
    }
    Ok(match moderation::set_profile_banned(pool.get_ref(), &auth, &profile_number, body.banned, reason(&body.reason)).await? {
        Ok(maps) => {
            cache.update_current_states(&[SP_PREVIEWS, COOP_PREVIEWS], &[false, false]).await;
            for (map_id, is_coop) in &maps {
                if cache.default_cat_ids.contains_key(map_id) {
                    cache.reload_rank(pool.get_ref(), map_id, &config, *is_coop).await;
                }
            }
            invalidate_points().await;
            HttpResponse::NoContent().finish()
        }
        Err(r) => refused(r),
    })
}

#[derive(Deserialize)]
pub struct WrHistoryBody {
    pub hidden: bool,
    pub reason: Option<String>,
}

/// **PUT** Remove a run from its map's WR history (`{"hidden": true}`) or put it back.
#[put("/admin/runs/{id}/wr_history")]
async fn admin_run_wr_history(
    auth: AdminOrService,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    cache: web::Data<CacheState>,
    id: web::Path<i64>,
    body: web::Json<WrHistoryBody>,
) -> Result<impl Responder> {
    let result = moderation::set_wr_hidden(pool.get_ref(), &auth, id.into_inner(), body.hidden, reason(&body.reason)).await;
    respond(result, &cache, &pool, &config).await
}

#[derive(Deserialize)]
pub struct RoleBody {
    /// "verifier", "moderator", "admin", or null to remove.
    pub role: Option<String>,
    pub reason: Option<String>,
}

/// **PUT** Set a player's staff tier. Admins (the admin tier) only.
#[put("/admin/users/{profile_number}/role")]
async fn admin_user_role(auth: AdminOrService, pool: web::Data<PgPool>, profile_number: web::Path<String>, body: web::Json<RoleBody>) -> Result<impl Responder> {
    if let AdminOrService::Admin(user) = &auth {
        if !user.is_role_admin() {
            return Ok(HttpResponse::Forbidden().body("Only admins can change roles."));
        }
    }
    let role = body.role.as_deref().map(str::trim).filter(|r| !r.is_empty());
    Ok(match moderation::set_role(pool.get_ref(), &auth, &profile_number, role, reason(&body.reason)).await? {
        Ok(()) => HttpResponse::NoContent().finish(),
        Err(r) => refused(r),
    })
}
