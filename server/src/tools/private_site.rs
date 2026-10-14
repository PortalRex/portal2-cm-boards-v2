//! Staff-only mode (`SERVER.PRIVATE=true`), for testing before launch: every API request needs a
//! signed-in staff account (verifier, moderator or admin) or the service token. Steam sign-in
//! (`/auth/...`) and `/site` stay open so staff can get in and the frontend can show its sign-in
//! page to everyone else.
use crate::tools::{auth, config::Config};
use actix_web::{
    body::{BoxBody, MessageBody},
    dev::{ServiceRequest, ServiceResponse},
    middleware::Next,
    web, Error, HttpResponse,
};
use sqlx::PgPool;

/// Paths open to everyone even in staff-only mode.
fn open(path: &str) -> bool {
    path.starts_with("/api/v1/auth/") || path == "/api/v1/site"
}

pub async fn gate(req: ServiceRequest, next: Next<impl MessageBody + 'static>) -> Result<ServiceResponse<BoxBody>, Error> {
    let Some(config) = req.app_data::<web::Data<Config>>().cloned() else {
        return Ok(next.call(req).await?.map_into_boxed_body());
    };
    if !config.server.private() || open(req.path()) || auth::service_token_ok(req.request(), &config) {
        return Ok(next.call(req).await?.map_into_boxed_body());
    }
    let pool = req.app_data::<web::Data<PgPool>>().cloned();
    let user = match pool {
        Some(pool) => auth::user_for_request(req.request(), pool.get_ref()).await.map_err(actix_web::error::ErrorInternalServerError)?,
        None => None,
    };
    let refusal = match user {
        Some(u) if u.is_admin() => return Ok(next.call(req).await?.map_into_boxed_body()),
        Some(_) => HttpResponse::Forbidden().body("This site is private for now: staff only."),
        None => HttpResponse::Unauthorized().body("This site is private for now: sign in with a staff account."),
    };
    Ok(req.into_response(refusal))
}
