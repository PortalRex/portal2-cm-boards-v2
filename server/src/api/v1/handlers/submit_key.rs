use crate::{
    controllers::autosubmit,
    tools::{auth::SignedIn, config::Config, error::Result, ratelimit},
};
use actix_web::{delete, get, post, web, HttpRequest, HttpResponse, Responder};
use serde_json::json;
use sqlx::PgPool;
use std::time::Duration;

/// **GET** Whether you have a SAR auto-submit key (signed in). The key itself is never shown again
/// after it's made (only its hash is kept).
///
/// Example: `GET /api/v1/user/submit-key`
/// ```json
/// { "has_key": true, "created": "2026-10-23T01:12:00" }
/// ```
#[get("/user/submit-key")]
async fn submit_key_status(user: SignedIn, pool: web::Data<PgPool>) -> Result<impl Responder> {
    let created = autosubmit::key_created(pool.get_ref(), &user.0.profile_number).await?;
    Ok(HttpResponse::Ok().insert_header(("Cache-Control", "no-store")).json(json!({ "has_key": created.is_some(), "created": created.flatten() })))
}

/// **POST** Makes you a new SAR auto-submit key, replacing the old one (which stops working), and
/// answers it once: `{ "key": "<32 hex characters>" }`. For SAR's `autosubmit.key`.
///
/// Example: `POST /api/v1/user/submit-key`
#[post("/user/submit-key")]
async fn submit_key_reset(req: HttpRequest, user: SignedIn, pool: web::Data<PgPool>, config: web::Data<Config>) -> Result<impl Responder> {
    if let Err(limited) = ratelimit::check(&req, &config, "submit-key", 10, Duration::from_secs(60 * 60)) {
        return Ok(limited);
    }
    let key = autosubmit::reset_key(pool.get_ref(), &user.0.profile_number).await?;
    Ok(HttpResponse::Ok().insert_header(("Cache-Control", "no-store")).json(json!({ "key": key })))
}

/// **DELETE** Removes your SAR auto-submit key (SAR stops submitting until you make a new one).
///
/// Example: `DELETE /api/v1/user/submit-key`
#[delete("/user/submit-key")]
async fn submit_key_remove(user: SignedIn, pool: web::Data<PgPool>) -> Result<impl Responder> {
    autosubmit::remove_key(pool.get_ref(), &user.0.profile_number).await?;
    Ok(HttpResponse::Ok().json(json!({ "has_key": false })))
}
