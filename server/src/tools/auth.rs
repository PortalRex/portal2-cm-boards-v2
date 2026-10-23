//! Who is making a request: people sign in with Steam (OpenID 2.0) and get a session cookie;
//! the board's own services authenticate with the shared service token.
//!
//! Handlers take one of the extractors below:
//! - [MaybeUser]: the signed-in user, if any (never rejects).
//! - [SignedIn]: rejects with 401 unless a non-banned user is signed in.
//! - [ServiceOnly]: rejects with 403 unless the request carries the service token.
//! - [AdminOrService]: rejects with 403 unless the request comes from the service token or a
//!   signed-in, non-banned staff member (`users.role`: verifier, moderator or admin). For now
//!   every staff tier has the same tools; [AuthUser::is_role_admin] gates role management.
//!
//! Session cookies are HttpOnly and SameSite=Lax (Secure on https), and only a SHA-256 hash of
//! the token is stored. As a second CSRF guard, requests that change data and carry an
//! `Origin` header must come from the site's own origin.
use crate::tools::config::Config;
use actix_web::{dev::Payload, error, http::Method, web, FromRequest, HttpRequest};
use rand::RngCore;
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgPool};
use std::{future::Future, pin::Pin};

pub const SESSION_COOKIE: &str = "p2cm_session";
pub const LOGIN_STATE_COOKIE: &str = "p2cm_login_state";
pub const SESSION_DAYS: i64 = 30;
pub const STEAM_OPENID: &str = "https://steamcommunity.com/openid/login";
const STEAM_ID_PREFIX: &str = "https://steamcommunity.com/openid/id/";

/// A signed-in user, as loaded with their session.
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct AuthUser {
    pub profile_number: String,
    pub user_name: String,
    pub avatar: Option<String>,
    pub admin: i32,
    /// Staff tier: "verifier", "moderator" or "admin" (None = not staff).
    pub role: Option<String>,
    pub banned: bool,
}

impl AuthUser {
    /// Any staff tier (and not banned).
    pub fn is_admin(&self) -> bool {
        self.role.is_some() && !self.banned
    }

    /// The admin tier specifically (assigns roles).
    pub fn is_role_admin(&self) -> bool {
        self.role.as_deref() == Some("admin") && !self.banned
    }
}

/// A new random token (hex, 256 bits).
pub fn random_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

pub fn hash_token(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

/// Constant-time string comparison for secrets.
pub fn secrets_match(expected: &str, given: &str) -> bool {
    expected.len() == given.len() && expected.bytes().zip(given.bytes()).fold(0u8, |acc, (a, b)| acc | (a ^ b)) == 0
}

/// `scheme://host[:port]` of a URL, for Origin checks.
pub fn origin_of(url: &str) -> &str {
    let after_scheme = url.find("://").map(|i| i + 3).unwrap_or(0);
    match url[after_scheme..].find('/') {
        Some(i) => &url[..after_scheme + i],
        None => url,
    }
}

/// The SteamID64 in an OpenID claimed id (`https://steamcommunity.com/openid/id/<17 digits>`).
pub fn steam_id_from_claimed_id(claimed_id: &str) -> Option<String> {
    let id = claimed_id.strip_prefix(STEAM_ID_PREFIX)?;
    (id.len() == 17 && id.bytes().all(|b| b.is_ascii_digit())).then(|| id.to_string())
}

/// A same-site path to send the user back to after signing in; anything else becomes "/".
pub fn safe_return_path(path: Option<&str>) -> String {
    match path {
        Some(p) if p.starts_with('/') && !p.starts_with("//") && !p.contains('\\') && !p.contains("://") => p.to_string(),
        _ => "/".to_string(),
    }
}

pub(crate) fn service_token_ok(req: &HttpRequest, config: &Config) -> bool {
    match (
        config.service.token.as_deref().filter(|t| !t.is_empty()),
        req.headers().get("X-Service-Token").and_then(|v| v.to_str().ok()),
    ) {
        (Some(expected), Some(given)) => secrets_match(expected, given),
        _ => false,
    }
}

/// Requests that change data must not come from another site's page.
pub(crate) fn origin_ok(req: &HttpRequest, config: &Config) -> bool {
    if matches!(*req.method(), Method::GET | Method::HEAD | Method::OPTIONS) {
        return true;
    }
    match req.headers().get("Origin").and_then(|v| v.to_str().ok()) {
        Some(origin) => origin == origin_of(config.server.public_url()),
        None => true, // non-browser clients; SameSite=Lax already keeps the cookie off cross-site posts
    }
}

/// How long a session's `last_seen` may lag before a request refreshes it.
const LAST_SEEN_REFRESH_MINUTES: i32 = 10;

/// Loads the user for the request's session cookie. `last_seen` is refreshed at most every
/// ten minutes, so the usual request is one read rather than a write.
pub async fn user_for_request(req: &HttpRequest, pool: &PgPool) -> Result<Option<AuthUser>, sqlx::Error> {
    let Some(cookie) = req.cookie(SESSION_COOKIE) else {
        return Ok(None);
    };
    let hash = hash_token(cookie.value());
    let row: Option<(AuthUser, bool)> = sqlx::query_as::<_, SessionRow>(
        r#"
            SELECT u.profile_number, COALESCE(u.board_name, u.steam_name, u.profile_number) AS user_name,
                   u.avatar, u.admin, u.role, u.banned,
                   s.last_seen < now() - make_interval(mins => $2) AS stale
            FROM sessions AS s JOIN users AS u ON u.profile_number = s.profile_number
            WHERE s.token_hash = $1 AND s.expires_at > now()
        "#,
    )
    .bind(&hash)
    .bind(LAST_SEEN_REFRESH_MINUTES)
    .fetch_optional(pool)
    .await?
    .map(|r| (AuthUser { profile_number: r.profile_number, user_name: r.user_name, avatar: r.avatar, admin: r.admin, role: r.role, banned: r.banned }, r.stale));
    let Some((user, stale)) = row else {
        return Ok(None);
    };
    if stale {
        sqlx::query("UPDATE sessions SET last_seen = now() WHERE token_hash = $1").bind(&hash).execute(pool).await?;
    }
    Ok(Some(user))
}

#[derive(FromRow)]
struct SessionRow {
    profile_number: String,
    user_name: String,
    avatar: Option<String>,
    admin: i32,
    role: Option<String>,
    banned: bool,
    stale: bool,
}

type Fut<T> = Pin<Box<dyn Future<Output = Result<T, actix_web::Error>>>>;

fn app_data(req: &HttpRequest) -> Result<(PgPool, Config), actix_web::Error> {
    let pool = req.app_data::<web::Data<PgPool>>().ok_or_else(|| error::ErrorInternalServerError("no database"))?;
    let config = req.app_data::<web::Data<Config>>().ok_or_else(|| error::ErrorInternalServerError("no config"))?;
    Ok((pool.get_ref().clone(), config.get_ref().clone()))
}

/// The signed-in user, if any.
pub struct MaybeUser(pub Option<AuthUser>);

impl FromRequest for MaybeUser {
    type Error = actix_web::Error;
    type Future = Fut<Self>;
    fn from_request(req: &HttpRequest, _: &mut Payload) -> Self::Future {
        let req = req.clone();
        Box::pin(async move {
            let (pool, _) = app_data(&req)?;
            let user = user_for_request(&req, &pool).await.map_err(error::ErrorInternalServerError)?;
            Ok(MaybeUser(user))
        })
    }
}

/// A signed-in, non-banned user.
pub struct SignedIn(pub AuthUser);

impl FromRequest for SignedIn {
    type Error = actix_web::Error;
    type Future = Fut<Self>;
    fn from_request(req: &HttpRequest, _: &mut Payload) -> Self::Future {
        let req = req.clone();
        Box::pin(async move {
            let (pool, config) = app_data(&req)?;
            if !origin_ok(&req, &config) {
                return Err(error::ErrorForbidden("Cross-site request refused."));
            }
            match user_for_request(&req, &pool).await.map_err(error::ErrorInternalServerError)? {
                Some(user) if !user.banned => Ok(SignedIn(user)),
                Some(_) => Err(error::ErrorForbidden("This account is banned.")),
                None => Err(error::ErrorUnauthorized("Sign in required.")),
            }
        })
    }
}

/// The board's own services only (the service token). For the raw insert/update endpoints the
/// backend service uses, which bypass the validated, audit-logged moderation paths; staff
/// accounts, whatever their tier, get 403.
pub struct ServiceOnly;

impl FromRequest for ServiceOnly {
    type Error = actix_web::Error;
    type Future = Fut<Self>;
    fn from_request(req: &HttpRequest, _: &mut Payload) -> Self::Future {
        let req = req.clone();
        Box::pin(async move {
            let (_, config) = app_data(&req)?;
            if service_token_ok(&req, &config) {
                Ok(ServiceOnly)
            } else {
                Err(error::ErrorForbidden("This endpoint is for the board's services."))
            }
        })
    }
}

/// The board's own services (service token) or a signed-in admin.
pub enum AdminOrService {
    Service,
    Admin(AuthUser),
}

impl FromRequest for AdminOrService {
    type Error = actix_web::Error;
    type Future = Fut<Self>;
    fn from_request(req: &HttpRequest, _: &mut Payload) -> Self::Future {
        let req = req.clone();
        Box::pin(async move {
            let (pool, config) = app_data(&req)?;
            if service_token_ok(&req, &config) {
                return Ok(AdminOrService::Service);
            }
            if !origin_ok(&req, &config) {
                return Err(error::ErrorForbidden("Cross-site request refused."));
            }
            match user_for_request(&req, &pool).await.map_err(error::ErrorInternalServerError)? {
                Some(user) if user.is_admin() => Ok(AdminOrService::Admin(user)),
                Some(_) => Err(error::ErrorForbidden("Staff only.")),
                None => Err(error::ErrorUnauthorized("Sign in required.")),
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claimed_ids() {
        assert_eq!(steam_id_from_claimed_id("https://steamcommunity.com/openid/id/76561198039230536").as_deref(), Some("76561198039230536"));
        assert_eq!(steam_id_from_claimed_id("http://steamcommunity.com/openid/id/76561198039230536"), None);
        assert_eq!(steam_id_from_claimed_id("https://steamcommunity.com/openid/id/7656119803923053"), None);
        assert_eq!(steam_id_from_claimed_id("https://steamcommunity.com/openid/id/76561198039230536/x"), None);
        assert_eq!(steam_id_from_claimed_id("https://evil.example/openid/id/76561198039230536"), None);
    }

    #[test]
    fn return_paths() {
        assert_eq!(safe_return_path(Some("/profile/1?x=2")), "/profile/1?x=2");
        assert_eq!(safe_return_path(Some("//evil.example")), "/");
        assert_eq!(safe_return_path(Some("https://evil.example")), "/");
        assert_eq!(safe_return_path(Some("/\\evil.example")), "/");
        assert_eq!(safe_return_path(None), "/");
    }

    #[test]
    fn origins() {
        assert_eq!(origin_of("https://board.portal2.sr/api/v1"), "https://board.portal2.sr");
        assert_eq!(origin_of("http://localhost:3000"), "http://localhost:3000");
    }

    #[test]
    fn secret_compare() {
        assert!(secrets_match("abc", "abc"));
        assert!(!secrets_match("abc", "abd"));
        assert!(!secrets_match("abc", "abcd"));
    }
}
