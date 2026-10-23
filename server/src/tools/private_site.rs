//! Staff-only mode (`SERVER.PRIVATE=true`), for testing before launch: every API request needs a
//! signed-in staff account (verifier, moderator or admin) or the service token.
//!
//! Read-only mode (`SERVER.READ_ONLY=true`), for the first days after opening: anyone can read, but
//! changes (any request that isn't GET, HEAD or OPTIONS) need a signed-in staff account or the
//! service token, so the Steam sync and staff keep working while players can't submit, react,
//! report or change their settings yet.
//!
//! In both, Steam sign-in and sign-out (`/auth/...`) and `/site` stay open, so staff can get in and
//! the frontend can tell everyone else which mode it's in.
use crate::tools::{auth, config::Config};
use actix_web::{
    body::{BoxBody, MessageBody},
    dev::{ServiceRequest, ServiceResponse},
    http::Method,
    middleware::Next,
    web, Error, HttpResponse,
};
use sqlx::PgPool;

/// What players see when a change is refused in read-only mode.
pub const READ_ONLY_MESSAGE: &str = "The boards are read-only for now: only staff can make changes.";

/// Paths open to everyone in both modes. SAR's auto-submit (`/api-v2`) signs in with a key, not a
/// session, and checks both modes itself (its key checks are POSTs that only read).
fn open(path: &str) -> bool {
    path.starts_with("/api/v1/auth/") || path == "/api/v1/site" || path.starts_with("/api-v2/")
}

fn is_change(method: &Method) -> bool {
    !matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS)
}

pub async fn gate(req: ServiceRequest, next: Next<impl MessageBody + 'static>) -> Result<ServiceResponse<BoxBody>, Error> {
    let Some(config) = req.app_data::<web::Data<Config>>().cloned() else {
        return Ok(next.call(req).await?.map_into_boxed_body());
    };
    let private = config.server.private();
    let read_only = config.server.read_only() && is_change(req.method());
    if (!private && !read_only) || open(req.path()) || auth::service_token_ok(req.request(), &config) {
        return Ok(next.call(req).await?.map_into_boxed_body());
    }
    let pool = req.app_data::<web::Data<PgPool>>().cloned();
    let user = match pool {
        Some(pool) => auth::user_for_request(req.request(), pool.get_ref()).await.map_err(actix_web::error::ErrorInternalServerError)?,
        None => None,
    };
    let refusal = match user {
        Some(u) if u.is_admin() => return Ok(next.call(req).await?.map_into_boxed_body()),
        Some(_) if private => HttpResponse::Forbidden().body("This site is private for now: staff only."),
        None if private => HttpResponse::Unauthorized().body("This site is private for now: sign in with a staff account."),
        _ => HttpResponse::Forbidden().body(READ_ONLY_MESSAGE),
    };
    Ok(req.into_response(refusal))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_stay_open_and_sign_in_works() {
        assert!(!is_change(&Method::GET));
        assert!(!is_change(&Method::HEAD));
        assert!(!is_change(&Method::OPTIONS));
        for m in [Method::POST, Method::PUT, Method::PATCH, Method::DELETE] {
            assert!(is_change(&m));
        }
        assert!(open("/api/v1/auth/logout"));
        assert!(open("/api/v1/site"));
        assert!(open("/api-v2/auto-submit"));
        assert!(!open("/api/v1/submissions"));
        assert!(!open("/api/v1/user/submit-key"));
        assert!(!open("/api/v1/auth"));
    }
}
