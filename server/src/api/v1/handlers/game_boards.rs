use crate::tools::{
    error::Result,
    points_cache::{PointsCache, Scope},
};
use actix_web::{get, http::header, web, HttpRequest, HttpResponse, Responder};
use sqlx::PgPool;

/// Chapter `game_mode`s (and chapter, for `chapter-<id>`) that make up each aggregated board.
fn scope_for(board: &str) -> Option<(Option<&'static [&'static str]>, Option<i32>)> {
    match board {
        "overall" => Some((None, None)),
        "sp" => Some((Some(&["sp"]), None)),
        "coop" => Some((Some(&["coop"]), None)),
        "story" => Some((Some(&["story"]), None)),
        "advanced" => Some((Some(&["advanced"]), None)),
        _ => board.strip_prefix("chapter-")?.parse().ok().map(|id| (None, Some(id))),
    }
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
    let scope = match (modes, chapter) {
        (_, Some(id)) => Scope::Chapter(id),
        (Some(modes), None) => Scope::Modes(modes),
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
