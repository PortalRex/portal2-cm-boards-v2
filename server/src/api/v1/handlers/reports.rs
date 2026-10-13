//! Anonymous run reports.
use crate::{
    controllers::{moderation::Refused, reports},
    tools::{
        auth::{origin_ok, AdminOrService, MaybeUser},
        config::Config,
        error::Result,
    },
};
use actix_web::{get, post, put, web, HttpRequest, HttpResponse, Responder};
use sqlx::PgPool;

fn refused(r: Refused) -> HttpResponse {
    match r {
        Refused::NotFound(m) => HttpResponse::NotFound().body(m),
        Refused::Invalid(m) => HttpResponse::BadRequest().body(m),
    }
}

#[derive(Deserialize)]
pub struct ReportBody {
    /// cheating, wrong_time, wrong_player, bad_proof or other.
    pub reason: String,
    pub details: Option<String>,
}

/// **POST** Report a run. Anonymous: staff see the report, not who sent it. Signed-in users are
/// told apart by account, others by address (for duplicate and spam checks only).
#[post("/runs/{id}/report")]
async fn run_report(
    req: HttpRequest,
    user: MaybeUser,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    id: web::Path<i64>,
    body: web::Json<ReportBody>,
) -> Result<impl Responder> {
    if !origin_ok(&req, &config) {
        return Ok(HttpResponse::Forbidden().body("Cross-site request refused."));
    }
    let who = match &user.0 {
        Some(u) if u.banned => return Ok(HttpResponse::Forbidden().body("This account is banned.")),
        Some(u) => format!("user:{}", u.profile_number),
        None => format!("addr:{}", req.connection_info().realip_remote_addr().unwrap_or("unknown")),
    };
    let salt = config.service.token.clone().filter(|t| !t.is_empty()).unwrap_or_else(|| config.steam.api_key.clone());
    let key = reports::reporter_key(&salt, &who);
    Ok(match reports::create_report(pool.get_ref(), id.into_inner(), body.reason.trim(), body.details.as_deref(), &key).await? {
        Ok(_) => HttpResponse::NoContent().finish(),
        Err(r) => refused(r),
    })
}

#[derive(Deserialize)]
pub struct ReportsQuery {
    /// open (default), resolved, dismissed or all.
    pub status: Option<String>,
    pub before: Option<i64>,
    pub limit: Option<i64>,
}

/// **GET** Run reports for staff, newest first, with the reported run.
#[get("/admin/reports")]
async fn admin_reports(_auth: AdminOrService, pool: web::Data<PgPool>, query: web::Query<ReportsQuery>) -> Result<impl Responder> {
    let status = match query.status.as_deref() {
        Some("all") => None,
        Some(s) => Some(s),
        None => Some("open"),
    };
    let rows = reports::list_reports(pool.get_ref(), status, query.limit.unwrap_or(50).clamp(1, 200), query.before).await?;
    Ok(web::Json(rows))
}

/// **GET** How many reports are open (for the staff badge).
#[get("/admin/reports/count")]
async fn admin_reports_count(_auth: AdminOrService, pool: web::Data<PgPool>) -> Result<impl Responder> {
    Ok(web::Json(serde_json::json!({ "open": reports::open_count(pool.get_ref()).await? })))
}

#[derive(Deserialize)]
pub struct ReportUpdate {
    /// resolved, dismissed or open (reopen).
    pub status: String,
    pub note: Option<String>,
    /// Apply to every open report on the same run.
    pub all_on_run: Option<bool>,
}

/// **PUT** Resolve, dismiss or reopen a report (recorded in the audit log).
#[put("/admin/reports/{id}")]
async fn admin_report_update(auth: AdminOrService, pool: web::Data<PgPool>, id: web::Path<i64>, body: web::Json<ReportUpdate>) -> Result<impl Responder> {
    let result = reports::set_status(pool.get_ref(), &auth, id.into_inner(), &body.status, body.note.as_deref(), body.all_on_run.unwrap_or(false)).await?;
    Ok(match result {
        Ok(()) => HttpResponse::NoContent().finish(),
        Err(r) => refused(r),
    })
}
