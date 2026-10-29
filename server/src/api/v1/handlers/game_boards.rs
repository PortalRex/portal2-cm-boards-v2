use crate::tools::{
    config::Config,
    error::Result,
    points_cache::{PointsCache, Scope},
    points_history, ratelimit,
};
use actix_web::{get, http::header, web, HttpRequest, HttpResponse, Responder};
use sqlx::PgPool;
use std::time::Duration;

/// Chapter `game_mode`s (and chapter, for `chapter-<id>`) that make up each aggregated board.
/// `overall`, `chapter-<id>`, or a chapter `game_mode` (board key).
fn scope_for(board: &str) -> Option<(Option<&str>, Option<i32>)> {
    if board == "overall" {
        return Some((None, None));
    }
    if let Some(id) = board.strip_prefix("chapter-") {
        return id.parse().ok().map(|id| (None, Some(id)));
    }
    let valid = (1..=20).contains(&board.len()) && board.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_');
    valid.then_some((Some(board), None))
}

/// **GET** aggregated points for any game, computed from the changelog.
///
/// `board` is `overall`, or a chapter `game_mode`: `sp` / `coop` (Portal 2),
/// `story` / `advanced` (Portal Stories: Mel), or `chapter-<chapter id>` for one chapter.
///
/// ## Example endpoint
/// - `/api/v1/points/game/2/story`
///
/// Returns the same shape as `/points/sp`: `{ "id": null, "points": [[profile_number, Points], ...] }`.
#[get("/points/game/{game_id}/{board}")]
async fn points_game(req: HttpRequest, pool: web::Data<PgPool>, cache: web::Data<PointsCache>, path: web::Path<(i32, String)>) -> Result<impl Responder> {
    let (game_id, board) = path.into_inner();
    let Some((modes, chapter)) = scope_for(&board) else {
        return Ok(HttpResponse::NotFound().body("Unknown board."));
    };
    let mode_list = [modes.unwrap_or("")];
    let scope = match (modes, chapter) {
        (_, Some(id)) => Scope::Chapter(id),
        (Some(_), None) => Scope::Modes(&mode_list),
        (None, None) => Scope::All,
    };
    let board = cache.board(pool.get_ref(), game_id, &board, scope).await?;
    // Boards are large; send the pre-compressed copy when the client accepts gzip.
    let gzip_ok = req
        .headers()
        .get(header::ACCEPT_ENCODING)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.split(',').any(|e| e.trim().starts_with("gzip")));
    Ok(if gzip_ok {
        HttpResponse::Ok()
            .content_type("application/json")
            .insert_header((header::CONTENT_ENCODING, "gzip"))
            .insert_header((header::VARY, "Accept-Encoding"))
            .body(board.gzip.as_slice().to_owned())
    } else {
        HttpResponse::Ok().content_type("application/json").body(board.json.as_str().to_owned())
    })
}

/// **GET** each player's points change on an aggregated board over the last 30 days: points
/// gained, or lost to being passed, since the start of the day 30 days ago (UTC). Players whose
/// points didn't change are left out. `board` as for `/points/game/{game_id}/{board}`.
///
/// ## Example endpoint
/// - `/api/v1/points/game/1/overall/changes`
///
/// ## Example JSON output
/// ```json
/// { "days": 30, "changes": { "76561198039230536": 12.5, "76561198254956991": -3.1 } }
/// ```
#[get("/points/game/{game_id}/{board}/changes")]
async fn points_game_changes(req: HttpRequest, config: web::Data<Config>, pool: web::Data<PgPool>, path: web::Path<(i32, String)>) -> Result<impl Responder> {
    if let Err(limited) = ratelimit::check(&req, &config, "points", 60, Duration::from_secs(60)) {
        return Ok(limited);
    }
    let (game_id, board) = path.into_inner();
    if scope_for(&board).is_none() {
        return Ok(HttpResponse::NotFound().body("Unknown board."));
    }
    Ok(match points_history::board_changes(pool.get_ref(), game_id, &board).await? {
        Some(changes) => HttpResponse::Ok().json(serde_json::json!({ "days": points_history::CHANGE_DAYS, "changes": changes })),
        None => HttpResponse::NotFound().body("Unknown board."),
    })
}

/// **GET** a player's current rank on every map of a game, computed from the changelog.
///
/// ## Example endpoint
/// - `/api/v1/ranks/game/2/76561198039912258`
///
/// ## Example JSON output
/// ```json
/// { "1": 3, "8": 2, ... }
/// ```
#[get("/ranks/game/{game_id}/{profile_number}")]
async fn ranks_game(pool: web::Data<PgPool>, cache: web::Data<PointsCache>, path: web::Path<(i32, String)>) -> Result<impl Responder> {
    let (game_id, profile_number) = path.into_inner();
    Ok(web::Json(cache.ranks(pool.get_ref(), game_id, &profile_number).await?))
}
