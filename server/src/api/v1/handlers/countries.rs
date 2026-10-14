//! Players' countries: a player sets their own (by hand or from their public Steam profile),
//! staff can set anyone's, and per-country stats come from the points boards.
use crate::{
    controllers::moderation,
    tools::{
        auth::{AdminOrService, SignedIn},
        config::Config,
        error::Result,
        points_cache::{invalidate_points, PointsCache, Scope},
    },
};
use actix_web::{get, post, put, web, HttpResponse, Responder};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::PgPool;
use std::collections::HashMap;

#[derive(Deserialize)]
pub struct CountryBody {
    /// countries.id, or null to clear.
    pub country_id: Option<i32>,
    pub reason: Option<String>,
}

/// Sets a player's country (None clears it). Refused for an unknown country.
async fn set_country(pool: &PgPool, profile_number: &str, country_id: Option<i32>) -> Result<Option<HttpResponse>> {
    if let Some(id) = country_id {
        let known: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM countries WHERE id = $1)").bind(id).fetch_one(pool).await?;
        if !known {
            return Ok(Some(HttpResponse::BadRequest().body("No such country.")));
        }
    }
    let res = sqlx::query("UPDATE users SET country_id = $2 WHERE profile_number = $1").bind(profile_number).bind(country_id).execute(pool).await?;
    if res.rows_affected() == 0 {
        return Ok(Some(HttpResponse::NotFound().body("No such player.")));
    }
    // The boards carry each player's country.
    invalidate_points().await;
    Ok(None)
}

/// **PUT** Set your own country (`{ "country_id": 226 }`, or null to clear it).
#[put("/user/country")]
async fn my_country(user: SignedIn, pool: web::Data<PgPool>, body: web::Json<CountryBody>) -> Result<impl Responder> {
    if let Some(refused) = set_country(pool.get_ref(), &user.0.profile_number, body.country_id).await? {
        return Ok(refused);
    }
    Ok(HttpResponse::Ok().json(json!({ "country_id": body.country_id })))
}

#[derive(Deserialize)]
struct SteamSummaries {
    response: SteamPlayers,
}

#[derive(Deserialize)]
struct SteamPlayers {
    players: Vec<SteamPlayer>,
}

#[derive(Deserialize)]
struct SteamPlayer {
    loccountrycode: Option<String>,
}

/// **POST** Set your country from your Steam profile (its public location). Answers
/// `{ "country_id" }`, or 404 when the Steam profile shows no country.
#[post("/user/country/steam")]
async fn my_country_from_steam(user: SignedIn, pool: web::Data<PgPool>, config: web::Data<Config>) -> Result<impl Responder> {
    let key = config.steam.api_key.as_str();
    if key.is_empty() || key == "unused" {
        return Ok(HttpResponse::ServiceUnavailable().body("Steam isn't set up on this server."));
    }
    let url = format!("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key={key}&steamids={}", user.0.profile_number);
    let code = match reqwest::get(&url).await {
        Ok(res) => res.json::<SteamSummaries>().await.ok().and_then(|s| s.response.players.into_iter().next()).and_then(|p| p.loccountrycode),
        Err(e) => {
            log::warn!("steam country: {e}");
            return Ok(HttpResponse::BadGateway().body("Couldn't reach Steam."));
        }
    };
    let Some(code) = code else {
        return Ok(HttpResponse::NotFound().body("Your Steam profile doesn't show a country (or it's private)."));
    };
    let id: Option<i32> = sqlx::query_scalar("SELECT id FROM countries WHERE upper(iso) = upper($1)").bind(&code).fetch_optional(pool.get_ref()).await?;
    let Some(id) = id else {
        return Ok(HttpResponse::NotFound().body("Steam's country isn't in the list."));
    };
    if let Some(refused) = set_country(pool.get_ref(), &user.0.profile_number, Some(id)).await? {
        return Ok(refused);
    }
    Ok(HttpResponse::Ok().json(json!({ "country_id": id })))
}

/// **PUT** Staff: set a player's country (`{ "country_id", "reason" }`); in the audit log.
#[put("/admin/users/{profile_number}/country")]
async fn admin_user_country(auth: AdminOrService, pool: web::Data<PgPool>, profile_number: web::Path<String>, body: web::Json<CountryBody>) -> Result<impl Responder> {
    let before: Option<Option<i32>> = sqlx::query_scalar("SELECT country_id FROM users WHERE profile_number = $1").bind(profile_number.as_str()).fetch_optional(pool.get_ref()).await?;
    let Some(before) = before else {
        return Ok(HttpResponse::NotFound().body("No such player."));
    };
    if let Some(refused) = set_country(pool.get_ref(), &profile_number, body.country_id).await? {
        return Ok(refused);
    }
    moderation::log_admin(
        pool.get_ref(),
        &auth,
        "profile.country",
        "profile",
        &profile_number,
        json!({ "before": before, "country_id": body.country_id, "reason": body.reason }),
    )
    .await?;
    Ok(HttpResponse::Ok().json(json!({ "country_id": body.country_id })))
}

#[derive(Serialize)]
struct TopPlayer {
    profile_number: String,
    user_name: Option<String>,
    avatar: Option<String>,
    points: f32,
}

#[derive(Serialize)]
struct CountryStats {
    country_id: i32,
    /// Players from the country on the board.
    players: usize,
    /// Their points together.
    points: f32,
    /// The country's best players, best first (up to 5).
    top: Vec<TopPlayer>,
}

#[derive(Deserialize)]
pub struct CountriesQuery {
    /// "overall" (default), "sp" or "coop" (Portal 2).
    pub board: Option<String>,
}

/// **GET** Per-country stats from a Portal 2 points board (overall by default): how many players
/// each country has on it, their points together, and its best players. Countries with the most
/// players first.
#[get("/countries/stats")]
async fn countries_stats(pool: web::Data<PgPool>, points_cache: web::Data<PointsCache>, query: web::Query<CountriesQuery>) -> Result<impl Responder> {
    let (key, scope) = match query.board.as_deref() {
        Some("sp") => ("sp", Scope::Modes(&["sp"])),
        Some("coop") => ("coop", Scope::Modes(&["coop"])),
        _ => ("overall", Scope::All),
    };
    let board = points_cache.board(pool.get_ref(), 1, key, scope).await?;
    let mut by_country: HashMap<i32, CountryStats> = HashMap::new();
    // The board is in points order, so each country's first players are its best.
    for (profile_number, p) in board.points.iter() {
        let Some(country) = p.country_id else { continue };
        let entry = by_country.entry(country).or_insert_with(|| CountryStats { country_id: country, players: 0, points: 0.0, top: Vec::new() });
        entry.players += 1;
        entry.points += p.points;
        if entry.top.len() < 5 {
            entry.top.push(TopPlayer { profile_number: profile_number.clone(), user_name: p.user_name.clone(), avatar: p.avatar.clone(), points: p.points });
        }
    }
    let mut out: Vec<CountryStats> = by_country.into_values().collect();
    out.sort_by(|a, b| b.players.cmp(&a.players).then(b.points.partial_cmp(&a.points).unwrap_or(std::cmp::Ordering::Equal)));
    Ok(web::Json(out))
}
