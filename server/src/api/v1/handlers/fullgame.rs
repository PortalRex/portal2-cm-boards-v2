//! Read-only endpoints for the full-game (speedrun.com-style) boards.
use crate::{controllers::fullgame, tools::error::Result};
use actix_web::{get, web, HttpResponse, Responder};
use sqlx::PgPool;
use std::collections::HashMap;

fn found<T: serde::Serialize>(value: Option<T>) -> HttpResponse {
    match value {
        Some(v) => HttpResponse::Ok().json(v),
        None => HttpResponse::NotFound().json(serde_json::json!({ "error": "Not found" })),
    }
}

/// **GET** every game with its categories.
///
/// - `/api/v1/fullgame/games`
#[get("/fullgame/games")]
async fn fullgame_games(pool: web::Data<PgPool>) -> Result<impl Responder> {
    Ok(web::Json(fullgame::games(pool.get_ref()).await?))
}

/// **GET** a game with its categories and levels.
///
/// - `/api/v1/fullgame/games/portal-2`
#[get("/fullgame/games/{game}")]
async fn fullgame_game(pool: web::Data<PgPool>, game: web::Path<String>) -> Result<impl Responder> {
    Ok(found(fullgame::game_page(pool.get_ref(), &game).await?))
}

/// **GET** a leaderboard. Per-level categories take the level as a third path segment
/// (default: the first level).
///
/// ## Query parameters
/// - `v<variable id>=<value slug>`: subcategory selection (default: first value of each)
/// - `obsolete=true`: include obsolete runs (unranked)
///
/// ## Example endpoints
/// - `/api/v1/fullgame/board/portal-2/single-player?v6=sla`
/// - `/api/v1/fullgame/board/portal-2/coop-il/mass-and-velocity`
#[get("/fullgame/board/{game}/{category}")]
async fn fullgame_board(
    pool: web::Data<PgPool>,
    path: web::Path<(String, String)>,
    query: web::Query<HashMap<String, String>>,
) -> Result<impl Responder> {
    let (game, category) = path.into_inner();
    let obsolete = query.get("obsolete").is_some_and(|v| v == "true" || v == "1");
    Ok(found(fullgame::board(pool.get_ref(), &game, &category, None, &query, obsolete).await?))
}

#[get("/fullgame/board/{game}/{category}/{level}")]
async fn fullgame_board_level(
    pool: web::Data<PgPool>,
    path: web::Path<(String, String, String)>,
    query: web::Query<HashMap<String, String>>,
) -> Result<impl Responder> {
    let (game, category, level) = path.into_inner();
    let obsolete = query.get("obsolete").is_some_and(|v| v == "true" || v == "1");
    Ok(found(fullgame::board(pool.get_ref(), &game, &category, Some(&level), &query, obsolete).await?))
}

/// **GET** a run with its runners, variable values, board rank and history.
///
/// - `/api/v1/fullgame/runs/1234`
#[get("/fullgame/runs/{id}")]
async fn fullgame_run(pool: web::Data<PgPool>, id: web::Path<i32>) -> Result<impl Responder> {
    Ok(found(fullgame::run_page(pool.get_ref(), id.into_inner()).await?))
}

/// **GET** a runner and their runs (newest first, with current board ranks).
///
/// - `/api/v1/fullgame/runners/42`
#[get("/fullgame/runners/{id}")]
async fn fullgame_runner(pool: web::Data<PgPool>, id: web::Path<i32>) -> Result<impl Responder> {
    Ok(found(fullgame::runner_page(pool.get_ref(), id.into_inner()).await?))
}
