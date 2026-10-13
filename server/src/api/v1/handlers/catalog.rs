//! The game catalog (games, seasons, chapters, maps, categories) and the admin editor for it.
//! Editing is for the admin tier (or the backend service).
use crate::{
    controllers::{
        catalog::{self, GameUpdate, LayoutChapter, NewGame, NewMap},
        moderation::{ActionResult, Refused},
    },
    tools::{
        auth::{AdminOrService, MaybeUser},
        error::Result,
        points_cache::invalidate_points,
    },
};
use actix_web::{delete, get, post, put, web, HttpResponse, Responder};
use chrono::NaiveDateTime;
use serde::Deserializer;
use sqlx::PgPool;

/// **GET** Every game and season with its chapters, maps and categories, in display order.
/// Staff also see hidden games.
#[get("/catalog")]
async fn catalog_get(user: MaybeUser, pool: web::Data<PgPool>) -> Result<impl Responder> {
    let staff = user.0.as_ref().is_some_and(|u| u.is_admin());
    Ok(web::Json(catalog::catalog(pool.get_ref(), staff).await?))
}

fn admin_only(auth: &AdminOrService) -> Option<HttpResponse> {
    match auth {
        AdminOrService::Admin(user) if !user.is_role_admin() => Some(HttpResponse::Forbidden().body("Only admins can edit games and maps.")),
        _ => None,
    }
}

async fn reply<T: serde::Serialize>(result: ActionResult<T>) -> Result<HttpResponse> {
    Ok(match result? {
        Ok(value) => {
            invalidate_points().await;
            HttpResponse::Ok().json(value)
        }
        Err(Refused::NotFound(m)) => HttpResponse::NotFound().body(m),
        Err(Refused::Invalid(m)) => HttpResponse::BadRequest().body(m),
    })
}

/// Distinguishes a field set to null (`Some(None)`) from a missing one (`None`).
fn nullable<'de, D: Deserializer<'de>, T: serde::Deserialize<'de>>(d: D) -> std::result::Result<Option<Option<T>>, D::Error> {
    serde::Deserialize::deserialize(d).map(Some)
}

#[derive(Deserialize)]
pub struct GameBody {
    pub name: String,
    pub slug: String,
    /// Set to create a season copying this game's map pool.
    pub base_game_id: Option<i32>,
    pub starts_at: Option<NaiveDateTime>,
    pub ends_at: Option<NaiveDateTime>,
    /// Season: link the copied maps to the originals (default true).
    pub link_to_base: Option<bool>,
}

/// **POST** Create a game, or a season (`base_game_id` + `starts_at`, optional `ends_at`).
#[post("/admin/games")]
async fn admin_game_create(auth: AdminOrService, pool: web::Data<PgPool>, body: web::Json<GameBody>) -> Result<impl Responder> {
    if let Some(r) = admin_only(&auth) {
        return Ok(r);
    }
    let new = NewGame {
        name: &body.name,
        slug: &body.slug,
        base_game_id: body.base_game_id,
        starts_at: body.starts_at,
        ends_at: body.ends_at,
        link_to_base: body.link_to_base.unwrap_or(true),
    };
    reply(catalog::create_game(pool.get_ref(), &auth, new).await.map(|r| r.map(|id| serde_json::json!({ "id": id })))).await
}

#[derive(Deserialize)]
pub struct GameUpdateBody {
    pub name: Option<String>,
    pub slug: Option<String>,
    #[serde(default, deserialize_with = "nullable")]
    pub starts_at: Option<Option<NaiveDateTime>>,
    #[serde(default, deserialize_with = "nullable")]
    pub ends_at: Option<Option<NaiveDateTime>>,
    pub hidden: Option<bool>,
}

/// **PUT** Rename a game, change its link name, hide it, or move a season's dates.
#[put("/admin/games/{id}")]
async fn admin_game_update(auth: AdminOrService, pool: web::Data<PgPool>, id: web::Path<i32>, body: web::Json<GameUpdateBody>) -> Result<impl Responder> {
    if let Some(r) = admin_only(&auth) {
        return Ok(r);
    }
    let update = GameUpdate { name: body.name.as_deref(), slug: body.slug.as_deref(), starts_at: body.starts_at, ends_at: body.ends_at, hidden: body.hidden };
    reply(catalog::update_game(pool.get_ref(), &auth, id.into_inner(), update).await).await
}

/// **DELETE** Delete a game or season without runs of its own.
#[delete("/admin/games/{id}")]
async fn admin_game_delete(auth: AdminOrService, pool: web::Data<PgPool>, id: web::Path<i32>) -> Result<impl Responder> {
    if let Some(r) = admin_only(&auth) {
        return Ok(r);
    }
    reply(catalog::delete_game(pool.get_ref(), &auth, id.into_inner()).await).await
}

#[derive(Deserialize)]
pub struct LayoutBody {
    pub chapters: Vec<LayoutChapter>,
}

/// **PUT** Save a game's chapter order and which chapter each map is in, in order.
#[put("/admin/games/{id}/layout")]
async fn admin_game_layout(auth: AdminOrService, pool: web::Data<PgPool>, id: web::Path<i32>, body: web::Json<LayoutBody>) -> Result<impl Responder> {
    if let Some(r) = admin_only(&auth) {
        return Ok(r);
    }
    reply(catalog::save_layout(pool.get_ref(), &auth, id.into_inner(), &body.chapters).await).await
}

#[derive(Deserialize)]
pub struct ChapterBody {
    pub name: Option<String>,
    /// The board the chapter's maps count for (`sp`, `coop`, ...).
    pub game_mode: Option<String>,
    pub is_multiplayer: Option<bool>,
}

/// **POST** Add a chapter to a game.
#[post("/admin/games/{id}/chapters")]
async fn admin_chapter_create(auth: AdminOrService, pool: web::Data<PgPool>, id: web::Path<i32>, body: web::Json<ChapterBody>) -> Result<impl Responder> {
    if let Some(r) = admin_only(&auth) {
        return Ok(r);
    }
    let multi = body.is_multiplayer.unwrap_or(false);
    let mode = body.game_mode.clone().unwrap_or_else(|| if multi { "coop".into() } else { "sp".into() });
    let result = catalog::create_chapter(pool.get_ref(), &auth, id.into_inner(), body.name.as_deref().unwrap_or(""), &mode, multi).await;
    reply(result.map(|r| r.map(|id| serde_json::json!({ "id": id })))).await
}

/// **PUT** Rename a chapter or change its board.
#[put("/admin/chapters/{id}")]
async fn admin_chapter_update(auth: AdminOrService, pool: web::Data<PgPool>, id: web::Path<i32>, body: web::Json<ChapterBody>) -> Result<impl Responder> {
    if let Some(r) = admin_only(&auth) {
        return Ok(r);
    }
    reply(catalog::update_chapter(pool.get_ref(), &auth, id.into_inner(), body.name.as_deref(), body.game_mode.as_deref()).await).await
}

/// **DELETE** Delete an empty chapter.
#[delete("/admin/chapters/{id}")]
async fn admin_chapter_delete(auth: AdminOrService, pool: web::Data<PgPool>, id: web::Path<i32>) -> Result<impl Responder> {
    if let Some(r) = admin_only(&auth) {
        return Ok(r);
    }
    reply(catalog::delete_chapter(pool.get_ref(), &auth, id.into_inner()).await).await
}

#[derive(Deserialize)]
pub struct MapBody {
    pub name: Option<String>,
    pub steam_id: Option<String>,
    #[serde(default, deserialize_with = "nullable")]
    pub bsp_name: Option<Option<String>>,
    /// New map: its first category's name (default "any%"). Update: the main category's id.
    pub category: Option<String>,
    pub default_cat_id: Option<i32>,
}

/// **POST** Add a map to a chapter (with its main category).
#[post("/admin/chapters/{id}/maps")]
async fn admin_map_create(auth: AdminOrService, pool: web::Data<PgPool>, id: web::Path<i32>, body: web::Json<MapBody>) -> Result<impl Responder> {
    if let Some(r) = admin_only(&auth) {
        return Ok(r);
    }
    let new = NewMap {
        name: body.name.as_deref().unwrap_or(""),
        steam_id: body.steam_id.as_deref(),
        bsp_name: body.bsp_name.as_ref().and_then(|b| b.as_deref()),
        category: body.category.as_deref(),
    };
    let result = catalog::create_map(pool.get_ref(), &auth, id.into_inner(), new).await;
    reply(result.map(|r| r.map(|steam_id| serde_json::json!({ "steam_id": steam_id })))).await
}

/// **PUT** Rename a map, set its map file name, or pick its main category.
#[put("/admin/maps/{steam_id}")]
async fn admin_map_update(auth: AdminOrService, pool: web::Data<PgPool>, steam_id: web::Path<String>, body: web::Json<MapBody>) -> Result<impl Responder> {
    if let Some(r) = admin_only(&auth) {
        return Ok(r);
    }
    let bsp = body.bsp_name.as_ref().map(|b| b.as_deref());
    reply(catalog::update_map(pool.get_ref(), &auth, &steam_id, body.name.as_deref(), bsp, body.default_cat_id).await).await
}

/// **DELETE** Delete a map without runs.
#[delete("/admin/maps/{steam_id}")]
async fn admin_map_delete(auth: AdminOrService, pool: web::Data<PgPool>, steam_id: web::Path<String>) -> Result<impl Responder> {
    if let Some(r) = admin_only(&auth) {
        return Ok(r);
    }
    reply(catalog::delete_map(pool.get_ref(), &auth, &steam_id).await).await
}

#[derive(Deserialize)]
pub struct LinkBody {
    /// The map (for map links) or game id (for game links) to link to.
    pub map: Option<String>,
    pub game_id: Option<i32>,
}

/// **POST** Link a map to a map of another game (`{"map": "s4-47458"}`).
#[post("/admin/maps/{steam_id}/links")]
async fn admin_map_link(auth: AdminOrService, pool: web::Data<PgPool>, steam_id: web::Path<String>, body: web::Json<LinkBody>) -> Result<impl Responder> {
    if let Some(r) = admin_only(&auth) {
        return Ok(r);
    }
    let Some(other) = body.map.as_deref() else {
        return Ok(HttpResponse::BadRequest().body("Pick the map to link to."));
    };
    reply(catalog::link_maps(pool.get_ref(), &auth, &steam_id, other).await).await
}

/// **DELETE** Remove the link between two maps.
#[delete("/admin/maps/{steam_id}/links/{other}")]
async fn admin_map_unlink(auth: AdminOrService, pool: web::Data<PgPool>, path: web::Path<(String, String)>) -> Result<impl Responder> {
    if let Some(r) = admin_only(&auth) {
        return Ok(r);
    }
    let (a, b) = path.into_inner();
    reply(catalog::unlink_maps(pool.get_ref(), &auth, &a, &b).await).await
}

/// **POST** Link every map of a game to the matching map of another (`{"game_id": 4}`).
#[post("/admin/games/{id}/links")]
async fn admin_game_link(auth: AdminOrService, pool: web::Data<PgPool>, id: web::Path<i32>, body: web::Json<LinkBody>) -> Result<impl Responder> {
    if let Some(r) = admin_only(&auth) {
        return Ok(r);
    }
    let Some(other) = body.game_id else {
        return Ok(HttpResponse::BadRequest().body("Pick the game to link to."));
    };
    let result = catalog::link_games(pool.get_ref(), &auth, id.into_inner(), other).await;
    reply(result.map(|r| r.map(|n| serde_json::json!({ "linked": n })))).await
}

/// **DELETE** Remove every link between two games' maps.
#[delete("/admin/games/{id}/links/{other}")]
async fn admin_game_unlink(auth: AdminOrService, pool: web::Data<PgPool>, path: web::Path<(i32, i32)>) -> Result<impl Responder> {
    if let Some(r) = admin_only(&auth) {
        return Ok(r);
    }
    let (a, b) = path.into_inner();
    let result = catalog::unlink_games(pool.get_ref(), &auth, a, b).await;
    reply(result.map(|r| r.map(|n| serde_json::json!({ "unlinked": n })))).await
}

#[derive(Deserialize)]
pub struct CategoryBody {
    pub name: String,
}

/// **POST** Add a category to a map.
#[post("/admin/maps/{steam_id}/categories")]
async fn admin_category_create(auth: AdminOrService, pool: web::Data<PgPool>, steam_id: web::Path<String>, body: web::Json<CategoryBody>) -> Result<impl Responder> {
    if let Some(r) = admin_only(&auth) {
        return Ok(r);
    }
    let result = catalog::create_category(pool.get_ref(), &auth, &steam_id, &body.name).await;
    reply(result.map(|r| r.map(|id| serde_json::json!({ "id": id })))).await
}

/// **PUT** Rename a category.
#[put("/admin/categories/{id}")]
async fn admin_category_update(auth: AdminOrService, pool: web::Data<PgPool>, id: web::Path<i32>, body: web::Json<CategoryBody>) -> Result<impl Responder> {
    if let Some(r) = admin_only(&auth) {
        return Ok(r);
    }
    reply(catalog::update_category(pool.get_ref(), &auth, id.into_inner(), &body.name).await).await
}

/// **DELETE** Delete a category without runs (not a map's main category).
#[delete("/admin/categories/{id}")]
async fn admin_category_delete(auth: AdminOrService, pool: web::Data<PgPool>, id: web::Path<i32>) -> Result<impl Responder> {
    if let Some(r) = admin_only(&auth) {
        return Ok(r);
    }
    reply(catalog::delete_category(pool.get_ref(), &auth, id.into_inner()).await).await
}
