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
        wr_webhooks,
    },
};
use actix_multipart::Multipart;
use actix_web::{delete, get, http::header, post, put, web, HttpRequest, HttpResponse, Responder};
use futures::StreamExt;
use serde_json::json;
use std::path::Path;
use chrono::NaiveDateTime;
use serde::{Deserialize, Deserializer};
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
    /// The name beside the logo in the header (null or empty = the site's default).
    #[serde(default, deserialize_with = "nullable")]
    pub short_name: Option<Option<String>>,
    /// Add or rename one of the game's modes: `{"mode": "sp", "name": "No hair"}` (empty name =
    /// default name, or remove a mode no chapter uses).
    pub mode_name: Option<ModeNameBody>,
}

#[derive(Deserialize)]
pub struct ModeNameBody {
    pub mode: String,
    pub name: String,
}

/// **PUT** Rename a game, add or rename one of its modes, change its link name or header name, hide it, or move a season's dates.
#[put("/admin/games/{id}")]
async fn admin_game_update(auth: AdminOrService, pool: web::Data<PgPool>, id: web::Path<i32>, body: web::Json<GameUpdateBody>) -> Result<impl Responder> {
    if let Some(r) = admin_only(&auth) {
        return Ok(r);
    }
    let update = GameUpdate {
        name: body.name.as_deref(),
        slug: body.slug.as_deref(),
        starts_at: body.starts_at,
        ends_at: body.ends_at,
        hidden: body.hidden,
        short_name: body.short_name.as_ref().map(|s| s.as_deref()),
        mode_name: body.mode_name.as_ref().map(|m| (m.mode.as_str(), m.name.as_str())),
    };
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

/// Largest map image accepted.
const MAX_IMAGE_BYTES: usize = 5 * 1024 * 1024;

/// The image type from the file's first bytes (PNG, JPEG or WebP), as (extension, MIME type).
fn image_kind(bytes: &[u8]) -> Option<(&'static str, &'static str)> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some(("png", "image/png"))
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some(("jpg", "image/jpeg"))
    } else if bytes.len() > 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some(("webp", "image/webp"))
    } else {
        None
    }
}

/// Reads the form field `image` of an upload: a PNG, JPEG or WebP up to [MAX_IMAGE_BYTES], with
/// its extension. Err is the answer to give.
async fn read_image(payload: &mut Multipart) -> std::result::Result<(Vec<u8>, &'static str), HttpResponse> {
    let mut bytes: Vec<u8> = Vec::new();
    while let Some(field) = payload.next().await {
        let Ok(mut field) = field else {
            return Err(HttpResponse::BadRequest().body("Upload failed."));
        };
        let is_image = field.name() == Some("image");
        while let Some(chunk) = field.next().await {
            let Ok(chunk) = chunk else {
                return Err(HttpResponse::BadRequest().body("Upload failed."));
            };
            if is_image {
                if bytes.len() + chunk.len() > MAX_IMAGE_BYTES {
                    return Err(HttpResponse::BadRequest().body("That image is too large (5 MB max)."));
                }
                bytes.extend_from_slice(&chunk);
            }
        }
    }
    match image_kind(&bytes) {
        Some((ext, _)) => Ok((bytes, ext)),
        None => Err(HttpResponse::BadRequest().body("Upload a PNG, JPEG or WebP image.")),
    }
}

/// Saves an uploaded image in IMAGES.STORAGE as `<prefix>-<random>.<ext>`; returns the file name.
async fn save_image(config: &crate::tools::config::Config, prefix: &str, bytes: &[u8], ext: &str) -> std::result::Result<String, HttpResponse> {
    let dir = config.images.storage();
    let name = format!("{}-{}.{ext}", sanitize_filename::sanitize(prefix), &crate::tools::auth::random_token()[..10]);
    let saved = match tokio::fs::create_dir_all(dir).await {
        Ok(()) => tokio::fs::write(Path::new(dir).join(&name), bytes).await,
        Err(e) => Err(e),
    };
    match saved {
        Ok(()) => Ok(name),
        Err(e) => {
            log::error!("images: {e}");
            Err(HttpResponse::InternalServerError().body("Images can't be saved right now."))
        }
    }
}

/// Answers with a stored image (its address changes with each upload, so it's cached for good).
async fn send_image(config: &crate::tools::config::Config, file: Option<String>, missing: &'static str) -> HttpResponse {
    let Some(file) = file else {
        return HttpResponse::NotFound().body(missing);
    };
    let Ok(bytes) = tokio::fs::read(Path::new(config.images.storage()).join(&file)).await else {
        return HttpResponse::NotFound().body(missing);
    };
    let mime = image_kind(&bytes).map(|(_, m)| m).unwrap_or("application/octet-stream");
    HttpResponse::Ok()
        .insert_header((header::CONTENT_TYPE, mime))
        .insert_header((header::CACHE_CONTROL, "public, max-age=31536000, immutable"))
        .body(bytes)
}

/// **POST** Set a map's image (admin tier; form field `image`: PNG, JPEG or WebP, up to 5 MB). It
/// replaces the site's built-in image for the map everywhere it's shown. Answers `{ "image_version" }`.
#[post("/admin/maps/{steam_id}/image")]
async fn admin_map_image_set(
    req: HttpRequest,
    auth: AdminOrService,
    pool: web::Data<PgPool>,
    config: web::Data<crate::tools::config::Config>,
    steam_id: web::Path<String>,
    mut payload: Multipart,
) -> Result<impl Responder> {
    if let Some(r) = admin_only(&auth) {
        return Ok(r);
    }
    if let Err(limited) = crate::tools::ratelimit::check(&req, &config, "upload", 10, std::time::Duration::from_secs(60)) {
        return Ok(limited);
    }
    let steam_id = steam_id.into_inner();
    let old: Option<Option<String>> = sqlx::query_scalar("SELECT image_file FROM maps WHERE steam_id = $1").bind(&steam_id).fetch_optional(pool.get_ref()).await?;
    let Some(old) = old else {
        return Ok(HttpResponse::NotFound().body("No such map."));
    };
    let (bytes, ext) = match read_image(&mut payload).await {
        Ok(v) => v,
        Err(r) => return Ok(r),
    };
    let name = match save_image(&config, &steam_id, &bytes, ext).await {
        Ok(n) => n,
        Err(r) => return Ok(r),
    };
    let dir = config.images.storage();
    let version: i64 = sqlx::query_scalar(
        "UPDATE maps SET image_file = $2, image_updated = now() AT TIME ZONE 'utc' WHERE steam_id = $1 RETURNING extract(epoch FROM image_updated)::bigint",
    )
    .bind(&steam_id)
    .bind(&name)
    .fetch_one(pool.get_ref())
    .await?;
    if let Some(old) = old {
        let _ = tokio::fs::remove_file(Path::new(dir).join(old)).await;
    }
    crate::controllers::moderation::log_admin(pool.get_ref(), &auth, "map.image", "map", &steam_id, json!({ "file": name, "bytes": bytes.len() })).await?;
    Ok(HttpResponse::Ok().json(json!({ "image_version": version })))
}

/// **DELETE** Remove a map's uploaded image (admin tier); the site's built-in one is used again.
#[delete("/admin/maps/{steam_id}/image")]
async fn admin_map_image_delete(
    auth: AdminOrService,
    pool: web::Data<PgPool>,
    config: web::Data<crate::tools::config::Config>,
    steam_id: web::Path<String>,
) -> Result<impl Responder> {
    if let Some(r) = admin_only(&auth) {
        return Ok(r);
    }
    let old: Option<Option<String>> = sqlx::query_scalar("SELECT image_file FROM maps WHERE steam_id = $1").bind(steam_id.as_str()).fetch_optional(pool.get_ref()).await?;
    let Some(old) = old else {
        return Ok(HttpResponse::NotFound().body("No such map."));
    };
    sqlx::query("UPDATE maps SET image_file = NULL, image_updated = NULL WHERE steam_id = $1").bind(steam_id.as_str()).execute(pool.get_ref()).await?;
    if let Some(old) = old {
        let _ = tokio::fs::remove_file(Path::new(config.images.storage()).join(old)).await;
        crate::controllers::moderation::log_admin(pool.get_ref(), &auth, "map.image_remove", "map", steam_id.as_str(), json!({})).await?;
    }
    Ok(HttpResponse::NoContent().finish())
}

/// **GET** A map's uploaded image (the address the catalog gives, `?v=` changes with each upload).
#[get("/maps/{steam_id}/image")]
async fn map_image(req: HttpRequest, pool: web::Data<PgPool>, config: web::Data<crate::tools::config::Config>, steam_id: web::Path<String>) -> Result<impl Responder> {
    let file: Option<Option<String>> = sqlx::query_scalar("SELECT image_file FROM maps WHERE steam_id = $1").bind(steam_id.as_str()).fetch_optional(pool.get_ref()).await?;
    let _ = req;
    Ok(send_image(&config, file.flatten(), "No image for this map.").await)
}

/// A game's pictures: its logo in the header and its page background, as (file column, time
/// column). Fixed names, so they can go into the SQL.
fn game_picture(kind: &str) -> Option<(&'static str, &'static str)> {
    match kind {
        "logo" => Some(("logo_file", "logo_updated")),
        "background" => Some(("background_file", "background_updated")),
        _ => None,
    }
}

/// **POST** Set a game's logo or background (`/admin/games/{id}/images/logo|background`, admin
/// tier; form field `image`: PNG, JPEG or WebP, up to 5 MB). Answers `{ "version" }`.
#[post("/admin/games/{id}/images/{kind}")]
async fn admin_game_image_set(
    req: HttpRequest,
    auth: AdminOrService,
    pool: web::Data<PgPool>,
    config: web::Data<crate::tools::config::Config>,
    path: web::Path<(i32, String)>,
    mut payload: Multipart,
) -> Result<impl Responder> {
    if let Some(r) = admin_only(&auth) {
        return Ok(r);
    }
    let (id, kind) = path.into_inner();
    let Some((file_col, time_col)) = game_picture(&kind) else {
        return Ok(HttpResponse::NotFound().body("A game has a logo and a background."));
    };
    if let Err(limited) = crate::tools::ratelimit::check(&req, &config, "upload", 10, std::time::Duration::from_secs(60)) {
        return Ok(limited);
    }
    let old: Option<Option<String>> = sqlx::query_scalar(&format!("SELECT {file_col} FROM games WHERE id = $1")).bind(id).fetch_optional(pool.get_ref()).await?;
    let Some(old) = old else {
        return Ok(HttpResponse::NotFound().body("No such game."));
    };
    let (bytes, ext) = match read_image(&mut payload).await {
        Ok(v) => v,
        Err(r) => return Ok(r),
    };
    let name = match save_image(&config, &format!("game{id}-{kind}"), &bytes, ext).await {
        Ok(n) => n,
        Err(r) => return Ok(r),
    };
    let version: i64 = sqlx::query_scalar(&format!(
        "UPDATE games SET {file_col} = $2, {time_col} = clock_timestamp() AT TIME ZONE 'utc' WHERE id = $1 RETURNING extract(epoch FROM {time_col})::bigint"
    ))
    .bind(id)
    .bind(&name)
    .fetch_one(pool.get_ref())
    .await?;
    if let Some(old) = old {
        let _ = tokio::fs::remove_file(Path::new(config.images.storage()).join(old)).await;
    }
    crate::controllers::moderation::log_admin(pool.get_ref(), &auth, &format!("game.{kind}"), "game", &id.to_string(), json!({ "file": name, "bytes": bytes.len() })).await?;
    Ok(HttpResponse::Ok().json(json!({ "version": version })))
}

/// **DELETE** Remove a game's uploaded logo or background (admin tier); the site's built-in one is used again.
#[delete("/admin/games/{id}/images/{kind}")]
async fn admin_game_image_delete(auth: AdminOrService, pool: web::Data<PgPool>, config: web::Data<crate::tools::config::Config>, path: web::Path<(i32, String)>) -> Result<impl Responder> {
    if let Some(r) = admin_only(&auth) {
        return Ok(r);
    }
    let (id, kind) = path.into_inner();
    let Some((file_col, time_col)) = game_picture(&kind) else {
        return Ok(HttpResponse::NotFound().body("A game has a logo and a background."));
    };
    let old: Option<Option<String>> = sqlx::query_scalar(&format!("SELECT {file_col} FROM games WHERE id = $1")).bind(id).fetch_optional(pool.get_ref()).await?;
    let Some(old) = old else {
        return Ok(HttpResponse::NotFound().body("No such game."));
    };
    sqlx::query(&format!("UPDATE games SET {file_col} = NULL, {time_col} = NULL WHERE id = $1")).bind(id).execute(pool.get_ref()).await?;
    if let Some(old) = old {
        let _ = tokio::fs::remove_file(Path::new(config.images.storage()).join(old)).await;
        crate::controllers::moderation::log_admin(pool.get_ref(), &auth, &format!("game.{kind}_remove"), "game", &id.to_string(), json!({})).await?;
    }
    Ok(HttpResponse::NoContent().finish())
}

#[derive(Deserialize)]
pub struct WebhookBody {
    /// A Discord webhook address, or null (or "") for none.
    pub url: Option<String>,
}

/// **GET** A game's Discord webhook for WR announcements (admin tier), with its secret part hidden:
/// `{ "set": true, "url": "https://discord.com/api/webhooks/123/…abcd" }` or `{ "set": false, "url": null }`.
#[get("/admin/games/{id}/webhook")]
async fn admin_game_webhook_get(auth: AdminOrService, pool: web::Data<PgPool>, id: web::Path<i32>) -> Result<impl Responder> {
    if let Some(r) = admin_only(&auth) {
        return Ok(r);
    }
    let url: Option<Option<String>> = sqlx::query_scalar("SELECT wr_webhook_url FROM games WHERE id = $1").bind(id.into_inner()).fetch_optional(pool.get_ref()).await?;
    let Some(url) = url else {
        return Ok(HttpResponse::NotFound().body("No such game."));
    };
    let url = url.filter(|u| !u.is_empty());
    Ok(HttpResponse::Ok().json(json!({ "set": url.is_some(), "url": url.as_deref().map(wr_webhooks::masked) })))
}

/// **PUT** Set (`{ "url": "https://discord.com/api/webhooks/..." }`) or remove (`{ "url": null }`) a
/// game's Discord webhook for WR announcements (admin tier). Each game, season included, has its
/// own; only Discord webhook addresses are accepted. The audit log notes the change, not the address.
#[put("/admin/games/{id}/webhook")]
async fn admin_game_webhook_set(auth: AdminOrService, pool: web::Data<PgPool>, id: web::Path<i32>, body: web::Json<WebhookBody>) -> Result<impl Responder> {
    if let Some(r) = admin_only(&auth) {
        return Ok(r);
    }
    let id = id.into_inner();
    let url = body.url.as_deref().map(str::trim).filter(|u| !u.is_empty());
    if url.is_some_and(|u| !wr_webhooks::valid_webhook(u)) {
        return Ok(HttpResponse::BadRequest().body("That isn't a Discord webhook address (https://discord.com/api/webhooks/...)."));
    }
    let updated = sqlx::query("UPDATE games SET wr_webhook_url = $2 WHERE id = $1").bind(id).bind(url).execute(pool.get_ref()).await?;
    if updated.rows_affected() == 0 {
        return Ok(HttpResponse::NotFound().body("No such game."));
    }
    crate::controllers::moderation::log_admin(pool.get_ref(), &auth, "game.wr_webhook", "game", &id.to_string(), json!({ "set": url.is_some() })).await?;
    Ok(HttpResponse::Ok().json(json!({ "set": url.is_some(), "url": url.map(wr_webhooks::masked) })))
}

/// **POST** Send a test message to a game's WR webhook (admin tier), to check it reaches the right channel.
#[post("/admin/games/{id}/webhook/test")]
async fn admin_game_webhook_test(
    req: HttpRequest,
    auth: AdminOrService,
    pool: web::Data<PgPool>,
    config: web::Data<crate::tools::config::Config>,
    id: web::Path<i32>,
) -> Result<impl Responder> {
    if let Some(r) = admin_only(&auth) {
        return Ok(r);
    }
    if let Err(limited) = crate::tools::ratelimit::check(&req, &config, "webhook-test", 5, std::time::Duration::from_secs(60)) {
        return Ok(limited);
    }
    let game: Option<(String, Option<String>)> = sqlx::query_as("SELECT game_name, wr_webhook_url FROM games WHERE id = $1").bind(id.into_inner()).fetch_optional(pool.get_ref()).await?;
    let Some((name, url)) = game else {
        return Ok(HttpResponse::NotFound().body("No such game."));
    };
    let Some(url) = url.filter(|u| !u.is_empty()) else {
        return Ok(HttpResponse::BadRequest().body("This game has no webhook yet."));
    };
    let body = json!({
        "username": name.chars().take(80).collect::<String>(),
        "content": format!("Test from {}: new {name} world records will be posted here.", config.server.public_url().trim_end_matches('/')),
        "allowed_mentions": { "parse": [] },
    });
    Ok(match wr_webhooks::post(&url, &body).await {
        Ok(()) => HttpResponse::NoContent().finish(),
        Err(wr_webhooks::PostError::Retry(why) | wr_webhooks::PostError::Refused(why)) => {
            log::warn!("WR webhook test for {name} failed: {why}");
            HttpResponse::BadGateway().body("Discord didn't take the message: check the webhook still exists.")
        }
    })
}

/// **GET** A game's uploaded logo or background (the address the catalog gives, `?v=` changes with each upload).
#[get("/games/{id}/images/{kind}")]
async fn game_image(pool: web::Data<PgPool>, config: web::Data<crate::tools::config::Config>, path: web::Path<(i32, String)>) -> Result<impl Responder> {
    let (id, kind) = path.into_inner();
    let Some((file_col, _)) = game_picture(&kind) else {
        return Ok(HttpResponse::NotFound().body("A game has a logo and a background."));
    };
    let file: Option<Option<String>> = sqlx::query_scalar(&format!("SELECT {file_col} FROM games WHERE id = $1")).bind(id).fetch_optional(pool.get_ref()).await?;
    Ok(send_image(&config, file.flatten(), "No such image for this game.").await)
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
