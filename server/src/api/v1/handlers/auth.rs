//! Steam sign-in (OpenID 2.0) and sessions.
//!
//! 1. `GET /auth/steam/login?return=/path` sends the browser to Steam, with a random state
//!    value in both the return URL and a short-lived cookie (so a login can only complete in
//!    the browser that started it).
//! 2. Steam sends the browser back to `GET /auth/steam/callback`. The response is checked
//!    (our return URL, the state, a fresh unused nonce, a Steam claimed id) and then confirmed
//!    with Steam itself (`check_authentication`), so it can't be forged. The user is created or
//!    refreshed from the Steam Web API and a session cookie is set.
//! 3. `GET /auth/me` returns the signed-in user (or `null`); `POST /auth/logout` ends the session.
use crate::{
    controllers::auth::{claim_nonce, create_session, delete_session, upsert_signed_in_user},
    models::users::Users,
    tools::{
        auth::{safe_return_path, steam_id_from_claimed_id, MaybeUser, LOGIN_STATE_COOKIE, SESSION_COOKIE, SESSION_DAYS, STEAM_OPENID},
        auth::random_token,
        config::Config,
        error::Result,
    },
};
use actix_web::{
    cookie::{time::Duration, Cookie, SameSite},
    get, http::header, post, web, HttpRequest, HttpResponse, Responder,
};
use chrono::{NaiveDateTime, Utc};
use reqwest::Url;
use sqlx::PgPool;
use std::collections::HashMap;

const NONCE_MAX_AGE_MINUTES: i64 = 15;

fn callback_url(config: &Config) -> String {
    format!("{}/api/v1/auth/steam/callback", config.server.public_url())
}

fn cookie<'a>(config: &Config, name: &'a str, value: String, max_age: Duration) -> Cookie<'a> {
    Cookie::build(name, value)
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(config.server.public_url().starts_with("https://"))
        .max_age(max_age)
        .finish()
}

fn redirect(to: &str) -> HttpResponse {
    HttpResponse::Found().insert_header((header::LOCATION, to.to_string())).finish()
}

/// Back to the site with a reason the sign-in failed (shown by the frontend).
fn failed(config: &Config, reason: &str) -> HttpResponse {
    log::warn!("Steam sign-in failed: {reason}");
    let mut res = redirect(&format!("/?signin=failed"));
    let _ = res.add_removal_cookie(&cookie(config, LOGIN_STATE_COOKIE, String::new(), Duration::ZERO));
    res
}

#[derive(Deserialize)]
pub struct LoginParams {
    #[serde(rename = "return")]
    pub return_to: Option<String>,
}

/// The host the browser used (`host[:port]`), as forwarded by a reverse proxy or direct.
fn request_host(req: &HttpRequest) -> Option<String> {
    let header = |name: &str| req.headers().get(name).and_then(|v| v.to_str().ok()).map(|v| v.split(',').next().unwrap_or("").trim().to_string());
    header("X-Forwarded-Host").or_else(|| header("Host")).filter(|h| !h.is_empty())
}

/// `host[:port]` of the configured public URL.
fn public_host(config: &Config) -> String {
    let url = Url::parse(config.server.public_url()).expect("valid public url");
    match url.port() {
        Some(port) => format!("{}:{port}", url.host_str().unwrap_or("")),
        None => url.host_str().unwrap_or("").to_string(),
    }
}

/// **GET** Starts Steam sign-in. `return` is the site path to come back to.
#[get("/auth/steam/login")]
async fn steam_login(req: HttpRequest, config: web::Data<Config>, params: web::Query<LoginParams>) -> impl Responder {
    let back = safe_return_path(params.return_to.as_deref());
    // Sign-in must start on the public address: Steam returns there, and the state cookie has
    // to be set on the same host. (Only ever redirects to the configured URL.)
    if request_host(&req).is_some_and(|h| !h.eq_ignore_ascii_case(&public_host(&config))) {
        let mut canonical = Url::parse(&format!("{}/api/v1/auth/steam/login", config.server.public_url())).expect("valid public url");
        canonical.query_pairs_mut().append_pair("return", &back);
        return redirect(canonical.as_str());
    }
    let state = random_token();
    let mut return_to = Url::parse(&callback_url(&config)).expect("valid public url");
    return_to
        .query_pairs_mut()
        .append_pair("state", &state)
        .append_pair("return", &back);
    let mut steam = Url::parse(STEAM_OPENID).unwrap();
    steam
        .query_pairs_mut()
        .append_pair("openid.ns", "http://specs.openid.net/auth/2.0")
        .append_pair("openid.mode", "checkid_setup")
        .append_pair("openid.return_to", return_to.as_str())
        .append_pair("openid.realm", config.server.public_url())
        .append_pair("openid.identity", "http://specs.openid.net/auth/2.0/identifier_select")
        .append_pair("openid.claimed_id", "http://specs.openid.net/auth/2.0/identifier_select");
    HttpResponse::Found()
        .insert_header((header::LOCATION, steam.to_string()))
        .cookie(cookie(&config, LOGIN_STATE_COOKIE, state, Duration::minutes(10)))
        .finish()
}

/// Whether a Steam nonce (`2026-10-12T15:59:13Z` + random suffix) is recent.
fn nonce_is_fresh(nonce: &str) -> bool {
    nonce
        .get(..20)
        .and_then(|ts| NaiveDateTime::parse_from_str(ts, "%Y-%m-%dT%H:%M:%SZ").ok())
        .map(|ts| (Utc::now().naive_utc() - ts).num_minutes().abs() <= NONCE_MAX_AGE_MINUTES)
        .unwrap_or(false)
}

/// Asks Steam to confirm the signed response it sent (OpenID `check_authentication`).
async fn confirmed_by_steam(params: &HashMap<String, String>) -> bool {
    let mut form: Vec<(&str, &str)> = params
        .iter()
        .filter(|(k, _)| k.starts_with("openid.") && k.as_str() != "openid.mode")
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();
    form.push(("openid.mode", "check_authentication"));
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(10)).build();
    let Ok(client) = client else { return false };
    match client.post(STEAM_OPENID).form(&form).send().await {
        Ok(res) => res.text().await.map(|body| body.lines().any(|l| l.trim() == "is_valid:true")).unwrap_or(false),
        Err(e) => {
            log::warn!("Steam check_authentication failed: {e}");
            false
        }
    }
}

/// **GET** Where Steam sends the browser back after sign-in.
#[get("/auth/steam/callback")]
async fn steam_callback(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    query: web::Query<HashMap<String, String>>,
) -> Result<impl Responder> {
    let q = query.into_inner();
    let get = |k: &str| q.get(k).map(String::as_str);

    // The response must be for us, from this browser's login, from Steam, and fresh.
    let state_cookie = req.cookie(LOGIN_STATE_COOKIE).map(|c| c.value().to_string());
    let return_to = get("openid.return_to").and_then(|u| Url::parse(u).ok());
    let expected = Url::parse(&callback_url(&config)).expect("valid public url");
    let return_ok = return_to.as_ref().is_some_and(|u| u.origin() == expected.origin() && u.path() == expected.path());
    let state_ok = match (get("state"), state_cookie.as_deref()) {
        (Some(s), Some(c)) => crate::tools::auth::secrets_match(c, s),
        _ => false,
    };
    // The state in the URL must be the one Steam signed into return_to.
    let signed_state = return_to.as_ref().and_then(|u| u.query_pairs().find(|(k, _)| k == "state").map(|(_, v)| v.into_owned()));
    if get("openid.mode") != Some("id_res") {
        return Ok(failed(&config, &format!("mode {:?}", get("openid.mode"))));
    }
    if !return_ok {
        return Ok(failed(&config, "return_to is not this site's callback"));
    }
    if state_cookie.is_none() {
        return Ok(failed(&config, "no login state cookie (sign-in started on another address, or cookies blocked)"));
    }
    if !state_ok || signed_state.as_deref() != get("state") {
        return Ok(failed(&config, "login state does not match"));
    }
    if get("openid.op_endpoint") != Some(STEAM_OPENID) {
        return Ok(failed(&config, "not from Steam"));
    }
    let Some(steam_id) = get("openid.claimed_id").and_then(steam_id_from_claimed_id) else {
        return Ok(failed(&config, "no Steam id"));
    };
    let Some(nonce) = get("openid.response_nonce").filter(|n| nonce_is_fresh(n)) else {
        return Ok(failed(&config, "stale or missing nonce"));
    };
    if !confirmed_by_steam(&q).await {
        return Ok(failed(&config, "Steam did not confirm the response"));
    }
    if !claim_nonce(pool.get_ref(), nonce).await? {
        return Ok(failed(&config, "response replayed"));
    }

    // Name and avatar from Steam when the Web API is configured and reachable.
    let steam_profile = match config.steam.api_key.as_str() {
        "" | "unused" => None,
        key => Users::new_from_steam(key, &steam_id).await.ok(),
    };
    upsert_signed_in_user(pool.get_ref(), &steam_id, steam_profile.as_ref()).await?;
    let user_agent = req.headers().get(header::USER_AGENT).and_then(|v| v.to_str().ok());
    let token = create_session(pool.get_ref(), &steam_id, user_agent).await?;

    let back = return_to
        .and_then(|u| u.query_pairs().find(|(k, _)| k == "return").map(|(_, v)| v.into_owned()))
        .map(|p| safe_return_path(Some(&p)))
        .unwrap_or_else(|| "/".to_string());
    let mut res = redirect(&back);
    res.add_cookie(&cookie(&config, SESSION_COOKIE, token, Duration::days(SESSION_DAYS)))
        .map_err(anyhow::Error::from)?;
    let _ = res.add_removal_cookie(&cookie(&config, LOGIN_STATE_COOKIE, String::new(), Duration::ZERO));
    Ok(res)
}

/// **GET** The signed-in user, or `null`.
///
/// ```json
/// { "profile_number": "76561198039230536", "user_name": "Zypeh", "avatar": "https://...", "admin": 0, "banned": false }
/// ```
#[get("/auth/me")]
async fn auth_me(user: MaybeUser) -> impl Responder {
    web::Json(user.0)
}

/// **POST** Signs out of this browser.
#[post("/auth/logout")]
async fn auth_logout(req: HttpRequest, pool: web::Data<PgPool>, config: web::Data<Config>) -> Result<impl Responder> {
    if let Some(c) = req.cookie(SESSION_COOKIE) {
        delete_session(pool.get_ref(), c.value()).await?;
    }
    let mut res = HttpResponse::NoContent().finish();
    let _ = res.add_removal_cookie(&cookie(&config, SESSION_COOKIE, String::new(), Duration::ZERO));
    Ok(res)
}

#[cfg(test)]
mod tests {
    use super::nonce_is_fresh;
    use chrono::Utc;

    #[test]
    fn nonces() {
        let now = Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
        assert!(nonce_is_fresh(&format!("{now}abc123")));
        assert!(!nonce_is_fresh("2020-01-01T00:00:00Zabc123"));
        assert!(!nonce_is_fresh("garbage"));
    }
}
