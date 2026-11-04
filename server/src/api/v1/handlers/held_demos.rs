//! Held demos for staff: uploads refused for a reason that may be the parser's or the game's
//! rather than the player's, kept instead of deleted (see [crate::controllers::held_demos]).
//! Staff download a held demo, have the parser read it again (after a parser fix), accept it (its
//! run is recorded as the submission would have been) or dismiss it. Every answer is in the audit log.
use crate::{
    api::v1::handlers::submissions::{record_submission, Submission},
    controllers::{
        held_demos::{self, Pending, Source},
        moderation::Refused,
        submissions::{self, BoardMap, DemoInfo},
    },
    models::users::Users,
    tools::{auth::AdminOrService, cache::CacheState, config::Config, error::Result},
};
use actix_files::NamedFile;
use actix_web::{get, http::header, post, web, HttpRequest, HttpResponse, Responder};
use serde_json::json;
use sqlx::PgPool;

fn refused(r: Refused) -> HttpResponse {
    match r {
        Refused::NotFound(m) => HttpResponse::NotFound().body(m),
        Refused::Invalid(m) => HttpResponse::BadRequest().body(m),
    }
}

/// What the parser reads from a held demo now (None: it can't read it); the caller stores it.
async fn read_again(config: &Config, held: &Pending) -> std::result::Result<Option<DemoInfo>, HttpResponse> {
    let Some(path) = held.path(&config.demo).filter(|p| p.exists()) else {
        return Err(HttpResponse::NotFound().body("This demo's file isn't available."));
    };
    Ok(submissions::parse_demo(&config.demo, &path).await.ok())
}

#[derive(Deserialize)]
pub struct HeldQuery {
    /// pending (default), accepted, dismissed or all.
    pub status: Option<String>,
    pub before: Option<i64>,
    pub limit: Option<i64>,
}

/// **GET** Held demos for staff, newest first, 50 at a time (`before`: the last id of the page).
///
/// Example: `GET /api/v1/admin/held-demos?status=pending`
/// ```json
/// [{ "id": 12, "profile_number": "76561198...", "user_name": "Runner", "avatar": "https://...", "map_id": "52777",
///    "map_name": "Doors", "game_id": 1, "is_coop": true, "source": "autosubmit", "claimed_score": 650,
///    "reason": "This demo doesn't contain a finished challenge mode run.", "file_size": 1834412,
///    "parsed": { "mapName": "mp_coop_doors", "timeScore": null, "players": [...] }, "note": null, "youtube_id": null,
///    "status": "pending", "changelog_id": null, "reviewed_by_name": null, "reviewed_at": null, "review_note": null,
///    "created_at": "2026-11-03T18:02:11" }]
/// ```
#[get("/admin/held-demos")]
async fn admin_held_demos(_auth: AdminOrService, pool: web::Data<PgPool>, query: web::Query<HeldQuery>) -> Result<impl Responder> {
    let status = match query.status.as_deref() {
        Some("all") => None,
        Some(s) => Some(s),
        None => Some("pending"),
    };
    let rows = held_demos::list(pool.get_ref(), status, query.limit.unwrap_or(50).clamp(1, 200), query.before).await?;
    Ok(HttpResponse::Ok().insert_header(("Cache-Control", "no-store")).json(rows))
}

/// **GET** How many held demos are waiting (for the staff badge).
///
/// Example: `GET /api/v1/admin/held-demos/count` → `{ "pending": 3 }`
#[get("/admin/held-demos/count")]
async fn admin_held_demos_count(_auth: AdminOrService, pool: web::Data<PgPool>) -> Result<impl Responder> {
    Ok(web::Json(json!({ "pending": held_demos::pending_count(pool.get_ref()).await? })))
}

/// **GET** Download a waiting held demo.
///
/// Example: `GET /api/v1/admin/held-demos/12/file`
#[get("/admin/held-demos/{id}/file")]
async fn admin_held_demo_file(req: HttpRequest, _auth: AdminOrService, pool: web::Data<PgPool>, config: web::Data<Config>, id: web::Path<i64>) -> Result<impl Responder> {
    let Some(held) = held_demos::pending(pool.get_ref(), id.into_inner()).await? else {
        return Ok(HttpResponse::NotFound().body("No such held demo waiting."));
    };
    let Some(path) = held.path(&config.demo) else {
        return Ok(HttpResponse::NotFound().body("This demo's file isn't available."));
    };
    let named = match NamedFile::open_async(&path).await {
        Ok(f) => f,
        Err(e) => {
            log::error!("held demo download {}: {e}", path.display());
            return Ok(HttpResponse::NotFound().body("This demo's file isn't available."));
        }
    };
    let disposition = header::ContentDisposition {
        disposition: header::DispositionType::Attachment,
        parameters: vec![header::DispositionParam::Filename(held.file_name.replace('"', ""))],
    };
    let mut res = named.set_content_type(mime::APPLICATION_OCTET_STREAM).set_content_disposition(disposition).into_response(&req);
    res.headers_mut().insert(header::CACHE_CONTROL, header::HeaderValue::from_static("private, no-store"));
    Ok(res)
}

/// **POST** Have the demo parser read a waiting held demo again (after a parser fix), and keep
/// what it reads. Responds `{ "parsed": {...} }`, or `{ "parsed": null }` when it still can't read it.
///
/// Example: `POST /api/v1/admin/held-demos/12/recheck`
#[post("/admin/held-demos/{id}/recheck")]
async fn admin_held_demo_recheck(_auth: AdminOrService, pool: web::Data<PgPool>, config: web::Data<Config>, id: web::Path<i64>) -> Result<impl Responder> {
    let Some(held) = held_demos::pending(pool.get_ref(), id.into_inner()).await? else {
        return Ok(HttpResponse::NotFound().body("No such held demo waiting."));
    };
    Ok(match read_again(&config, &held).await {
        Ok(info) => {
            held_demos::set_parsed(pool.get_ref(), held.id, info.as_ref()).await?;
            HttpResponse::Ok().json(json!({ "parsed": info }))
        }
        Err(missing) => missing,
    })
}

#[derive(Deserialize)]
pub struct ReviewBody {
    /// For the audit log.
    pub note: Option<String>,
}

/// The run a held demo is of, as the parser reads it now: its map and time (the demo's own, else
/// the one SAR sent), or why it can't be accepted as it is.
async fn held_run(pool: &PgPool, held: &Pending, info: Option<&DemoInfo>) -> Result<std::result::Result<(BoardMap, i32), &'static str>> {
    let map = match &held.map_id {
        Some(id) => submissions::map_by_id(pool, id).await?,
        // From the demo, when only one board map has its map file (Mel's Story and Advanced maps
        // share theirs).
        None => match info.and_then(|i| i.map_name.as_deref()) {
            Some(bsp) => {
                let mut maps = submissions::maps_for_bsp(pool, bsp).await?;
                if maps.len() == 1 { maps.pop() } else { None }
            }
            None => None,
        },
    };
    let Some(map) = map else {
        return Ok(Err("The demo's map isn't known: download it and enter the run by hand in Submit Run."));
    };
    let Some(score) = info.and_then(|i| i.time_score).or(held.claimed_score) else {
        return Ok(Err("The demo has no time to accept: download it and enter the run by hand in Submit Run."));
    };
    Ok(Ok((map, score)))
}

/// **POST** Accept a waiting held demo: the parser reads it again, and its run is recorded as the
/// submission would have been, with the demo's own time, else the time SAR sent (a demo without
/// either, or of an unknown map, is entered by hand in Submit Run instead). Refused like the
/// submission when the run isn't the player's best. The held file is deleted once it's on the run.
/// Responds as Submit Run does.
///
/// Example: `POST /api/v1/admin/held-demos/12/accept` with `{ "note": "lost session, time checked" }`
#[post("/admin/held-demos/{id}/accept")]
async fn admin_held_demo_accept(
    auth: AdminOrService,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    cache: web::Data<CacheState>,
    id: web::Path<i64>,
    body: web::Json<ReviewBody>,
) -> Result<impl Responder> {
    // Locked until it's answered, so two staff can't record it twice.
    let mut tx = pool.begin().await?;
    let held = match held_demos::lock_pending(&mut tx, id.into_inner()).await? {
        Ok(h) => h,
        Err(r) => return Ok(refused(r)),
    };
    let info = match read_again(&config, &held).await {
        Ok(info) => info,
        Err(missing) => return Ok(missing),
    };
    held_demos::set_parsed(&mut *tx, held.id, info.as_ref()).await?;
    let (map, score) = match held_run(pool.get_ref(), &held, info.as_ref()).await? {
        Ok(run) => run,
        Err(why) => return Ok(HttpResponse::BadRequest().body(why)),
    };
    let Some(account) = Users::get_user(pool.get_ref(), held.profile_number.clone()).await? else {
        return Ok(HttpResponse::BadRequest().body("No such player."));
    };
    if account.banned || account.frozen {
        return Ok(HttpResponse::BadRequest().body(if account.frozen { "This profile is frozen and can't get new times." } else { "This account is banned." }));
    }
    let Some(bytes) = held.path(&config.demo).and_then(|p| std::fs::read(p).ok()) else {
        return Ok(HttpResponse::NotFound().body("This demo's file isn't available."));
    };
    let players = info.as_ref().map(|i| i.players.as_slice()).unwrap_or_default();
    let partner = map
        .is_coop
        .then(|| players.iter().find(|p| p.steam_id != held.profile_number))
        .flatten()
        .map(|p| (p.steam_id.clone(), Some(p.name.clone())));
    let submission = Submission {
        map,
        profile_number: held.profile_number.clone(),
        score,
        partner,
        demo: Some(&bytes),
        note: held.note.clone(),
        youtube_id: held.youtube_id.clone(),
        // Only when the time is the demo's own.
        portals: info.as_ref().filter(|i| i.time_score == Some(score)).and_then(|i| i.portal_score),
        submission: Source::parse(&held.source).unwrap_or(Source::Submit).submission(),
    };
    let done = match record_submission(pool.get_ref(), &config, &cache, submission).await? {
        Ok(done) => done,
        Err(refused) => return Ok(refused),
    };
    held_demos::review(&mut tx, &auth, &held, Some(done.recorded.changelog_id), body.note.as_deref()).await?;
    tx.commit().await?;
    held_demos::remove_file(&config.demo, &held).await;
    Ok(HttpResponse::Ok().json(done.response()))
}

/// **POST** Dismiss a waiting held demo: its file is deleted (the record of it stays).
///
/// Example: `POST /api/v1/admin/held-demos/12/dismiss` with `{ "note": "not a finished run" }`
#[post("/admin/held-demos/{id}/dismiss")]
async fn admin_held_demo_dismiss(auth: AdminOrService, pool: web::Data<PgPool>, config: web::Data<Config>, id: web::Path<i64>, body: web::Json<ReviewBody>) -> Result<impl Responder> {
    let mut tx = pool.begin().await?;
    let held = match held_demos::lock_pending(&mut tx, id.into_inner()).await? {
        Ok(h) => h,
        Err(r) => return Ok(refused(r)),
    };
    held_demos::review(&mut tx, &auth, &held, None, body.note.as_deref()).await?;
    tx.commit().await?;
    held_demos::remove_file(&config.demo, &held).await;
    Ok(HttpResponse::NoContent().finish())
}
