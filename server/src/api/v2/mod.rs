//! The old boards' `/api-v2`, for SAR's challenge mode auto-submit (p2sr/SourceAutoRecord,
//! `src/Features/AutoSubmit.cpp`), at the site root as SAR expects: `https://<boards>/api-v2/...`.
//! Requests and answers match the old boards' (p2sr/Portal2Boards, `classes/Router.php`), so SAR
//! works unchanged.
//!
//! Every endpoint is a `POST` with a multipart form carrying `auth_hash`, the player's submit key
//! (made in Settings; see [crate::controllers::autosubmit]). Failures answer 400 with a short text,
//! as the old boards did; SAR only checks for 200.
//!
//! Hardening: the key is checked by its SHA-256; wrong keys count against the client's address and
//! lock it out after [AUTH_FAILURES] in [AUTH_WINDOW]; every endpoint is rate limited, uploads more
//! tightly; banned accounts' keys don't work, frozen profiles can't submit, and while the site is in
//! staff-only mode only staff players' keys work. A submitted demo is checked like Submit Run's: of
//! the map named, with the time named, and with the key's owner in it.
use crate::{
    api::v1::handlers::submissions::{bad, parse_upload, read_form_with, record_submission, save_demo, DemoField, Form, Submission},
    controllers::{autosubmit, submissions},
    tools::{
        cache::{CacheState, COOP_PREVIEWS, SP_PREVIEWS},
        config::Config,
        error::Result,
        points_cache::invalidate_points,
        ratelimit,
    },
};
use actix_multipart::Multipart;
use actix_web::{post, web, HttpRequest, HttpResponse, Responder};
use serde_json::json;
use sqlx::PgPool;
use futures::FutureExt;
use std::{cell::RefCell, rc::Rc, time::Duration};

/// Wrong keys an address may send in [AUTH_WINDOW] before its key checks are refused.
const AUTH_FAILURES: u32 = 20;
const AUTH_WINDOW: Duration = Duration::from_secs(10 * 60);
/// Most places above or below the player `top-scores` returns (SAR asks for 3 and 2).
const MAX_AROUND: usize = 10;
/// The board's length for `top-scores`, as the map pages.
const BOARD_LENGTH: i64 = 500;

pub fn init(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api-v2")
            .service(validate_user)
            .service(current_pb)
            .service(top_scores)
            .service(download_maps)
            .service(auto_submit),
    );
}

type Verdict = std::result::Result<autosubmit::KeyOwner, HttpResponse>;

/// The key's owner, or the answer refusing the request.
async fn authenticate(req: &HttpRequest, config: &Config, pool: &PgPool, key: Option<&str>) -> Result<Verdict> {
    if ratelimit::exceeded(req, config, "autosubmit-auth", AUTH_FAILURES, AUTH_WINDOW) {
        return Ok(Err(HttpResponse::TooManyRequests().insert_header(("Retry-After", AUTH_WINDOW.as_secs().to_string())).body("Too many invalid keys; try again later.")));
    }
    let Some(key) = key.map(str::trim).filter(|k| !k.is_empty()) else {
        return Ok(Err(bad("Missing parameters")));
    };
    match autosubmit::owner_of(pool, key).await? {
        Some(owner) if !owner.banned => {
            if config.server.private() && !owner.staff {
                return Ok(Err(HttpResponse::Forbidden().body("This site is private for now: staff only.")));
            }
            Ok(Ok(owner))
        }
        _ => {
            // Counted only on failure; the check above refuses once over the limit.
            let _ = ratelimit::check(req, config, "autosubmit-auth", AUTH_FAILURES, AUTH_WINDOW);
            Ok(Err(bad("User validation failed")))
        }
    }
}

/// Reads the form and checks the key: the owner and the form, or the answer refusing the request.
/// Only `auto-submit` takes a demo file (`allow_demo`), and its key is checked when the file starts,
/// before any of it is read, so it must come first in the form (SAR sends it first).
async fn open(req: &HttpRequest, config: &Config, pool: &PgPool, payload: Multipart, allow_demo: bool) -> Result<std::result::Result<(autosubmit::KeyOwner, Form), HttpResponse>> {
    if let Err(limited) = ratelimit::check(req, config, "autosubmit", 120, Duration::from_secs(60)) {
        return Ok(Err(limited));
    }
    // The check before the upload records its verdict here.
    let early: Rc<RefCell<Option<Result<Verdict>>>> = Rc::new(RefCell::new(None));
    let demo_field = if allow_demo {
        let early = early.clone();
        DemoField::Checked(Box::new(move |fields| {
            let key = fields.get("auth_hash").cloned();
            async move {
                let verdict = authenticate(req, config, pool, key.as_deref()).await;
                let ok = matches!(verdict, Ok(Ok(_)));
                *early.borrow_mut() = Some(verdict);
                ok
            }
            .boxed_local()
        }))
    } else {
        DemoField::Refused
    };
    let read = read_form_with(payload, demo_field).await;
    let early = early.borrow_mut().take();
    match (read, early) {
        (Ok(form), Some(verdict)) => Ok(verdict?.map(|owner| (owner, form))),
        (Ok(form), None) => Ok(authenticate(req, config, pool, form.get("auth_hash")).await?.map(|owner| (owner, form))),
        // Stopped before the upload (the key's refusal), or the upload itself failed (too large...).
        (Err(e), Some(verdict)) => Ok(Err(match verdict? {
            Err(refused) => refused,
            Ok(_) => bad(e),
        })),
        (Err(e), None) => Ok(Err(bad(e))),
    }
}

/// The board map named by the form's `mapId`.
async fn form_map(pool: &PgPool, form: &Form) -> Result<Option<(submissions::BoardMap, Option<String>)>> {
    let Some(id) = form.get("mapId").filter(|id| (1..=32).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')) else {
        return Ok(None);
    };
    Ok(autosubmit::submit_map(pool, id).await?)
}

fn iso(t: Option<chrono::NaiveDateTime>) -> Option<String> {
    t.map(|t| t.format("%Y-%m-%dT%H:%M:%SZ").to_string())
}

/// **POST** Checks a submit key (form: `auth_hash`). Answers `{ "userId": "<SteamID>" }`, or 400
/// `User validation failed`.
///
/// Example: `POST /api-v2/validate-user`
#[post("/validate-user")]
async fn validate_user(req: HttpRequest, pool: web::Data<PgPool>, config: web::Data<Config>, payload: Multipart) -> Result<impl Responder> {
    let (owner, _) = match open(&req, &config, &pool, payload, false).await? {
        Ok(ok) => ok,
        Err(refused) => return Ok(refused),
    };
    Ok(HttpResponse::Ok().json(json!({ "userId": owner.profile_number })))
}

/// **POST** The key owner's current PB on a map (form: `auth_hash`, `mapId`): verified and not
/// banned, so a time still waiting for its demo doesn't stop SAR submitting the demo. Answers
/// `{ "id", "score", "map_id", "profile_number", "time_gained" }` with the score as a string (SAR
/// reads it so), or `{}` without one.
///
/// Example: `POST /api-v2/current-pb` (`mapId=47458`)
/// ```json
/// { "id": "365811", "score": "1233", "map_id": "47458", "profile_number": "76561199013726692", "time_gained": "2026-10-19T22:51:11Z" }
/// ```
#[post("/current-pb")]
async fn current_pb(req: HttpRequest, pool: web::Data<PgPool>, config: web::Data<Config>, payload: Multipart) -> Result<impl Responder> {
    let (owner, form) = match open(&req, &config, &pool, payload, false).await? {
        Ok(ok) => ok,
        Err(refused) => return Ok(refused),
    };
    let Some((map, _)) = form_map(&pool, &form).await? else {
        return Ok(bad("No valid Map Id Provided"));
    };
    Ok(HttpResponse::Ok().json(match autosubmit::current_pb(&pool, &map, &owner.profile_number).await? {
        Some(pb) => json!({
            "id": pb.id.to_string(),
            "score": pb.score.to_string(),
            "map_id": map.steam_id,
            "profile_number": owner.profile_number,
            "time_gained": iso(pb.timestamp),
        }),
        None => json!({}),
    }))
}

/// **POST** The board around the key owner's place on a map, for SAR's in-game times list (form:
/// `auth_hash`, `mapId`, `before`, `after`, each at most 10): `before` players above them and
/// `after` below, or the top when they aren't on it. Scores and ranks are strings, as on the old
/// boards.
///
/// Example: `POST /api-v2/top-scores` (`mapId=47458`, `before=3`, `after=2`)
/// ```json
/// [{ "userData": { "profileNumber": "76561198...", "boardname": "Runner", "avatar": "https://..." },
///    "scoreData": { "score": "1205", "playerRank": "4", "scoreRank": "4", "date": "2026-10-08T19:43:23Z" } }]
/// ```
#[post("/top-scores")]
async fn top_scores(req: HttpRequest, pool: web::Data<PgPool>, config: web::Data<Config>, payload: Multipart) -> Result<impl Responder> {
    let (owner, form) = match open(&req, &config, &pool, payload, false).await? {
        Ok(ok) => ok,
        Err(refused) => return Ok(refused),
    };
    let Some((map, _)) = form_map(&pool, &form).await? else {
        return Ok(bad("{\"error\":\"Invalid value for field 'mapId'\"}"));
    };
    let count = |name: &str| form.get(name).and_then(|v| v.parse::<usize>().ok()).map(|n| n.min(MAX_AROUND));
    let (Some(before), Some(after)) = (count("before"), count("after")) else {
        return Ok(bad("{\"error\":\"Invalid value for field 'before' or 'after'\"}"));
    };
    let places = autosubmit::board_places(&pool, &map, BOARD_LENGTH).await?;
    // Ranks: tied times share the rank of the first of them.
    let mut ranked = Vec::with_capacity(places.len());
    for (i, p) in places.iter().enumerate() {
        let rank = match ranked.last() {
            Some((prev, r)) if places[*prev as usize].score == p.score => *r,
            _ => i as i64 + 1,
        };
        ranked.push((i as i64, rank));
    }
    let index = places.iter().position(|p| p.profile_number == owner.profile_number);
    let picked = autosubmit::around(&ranked, index, before, after);
    let entries: Vec<_> = picked
        .iter()
        .map(|(i, rank)| {
            let p = &places[*i as usize];
            json!({
                "userData": { "profileNumber": p.profile_number, "boardname": p.user_name, "avatar": p.avatar },
                "scoreData": { "score": p.score.to_string(), "playerRank": rank.to_string(), "scoreRank": rank.to_string(), "date": iso(p.timestamp) },
            })
        })
        .collect();
    Ok(HttpResponse::Ok().json(entries))
}

/// **POST** The game's board maps by map file (form: `auth_hash`, optional `game`), for SAR's Mel
/// auto-submit (its Portal 2 map ids are built in). The game is `game` (`mel` or `portal2`) when
/// given, else follows the address used, as SAR expects: `mel.` hosts get Portal Stories: Mel,
/// others Portal 2. Answers `{ "maps": [{ "level_name", "id" }] }`. Mel's Story and Advanced maps
/// share their map files; the Story map comes first.
///
/// Example: `POST /api-v2/download-maps`
#[post("/download-maps")]
async fn download_maps(req: HttpRequest, pool: web::Data<PgPool>, config: web::Data<Config>, payload: Multipart) -> Result<impl Responder> {
    let form = match open(&req, &config, &pool, payload, false).await? {
        Ok((_, form)) => form,
        Err(refused) => return Ok(refused),
    };
    let host = req.connection_info().host().to_ascii_lowercase();
    let game = match form.get("game") {
        Some("mel") => 2,
        Some("portal2") => 1,
        _ if host.starts_with("mel.") || host.starts_with("melboard.") => 2,
        _ => 1,
    };
    let maps: Vec<_> = autosubmit::game_maps(&pool, game).await?.into_iter().map(|(level, id)| json!({ "level_name": level, "id": id })).collect();
    Ok(HttpResponse::Ok().json(json!({ "maps": maps })))
}

/// **POST** Submits a run with its demo (form: `auth_hash`, `mapId`, `score` in centiseconds,
/// `demoFile`; SAR also sends a co-op partner's name as `comment`, which isn't needed: the partner
/// comes from the demo). Checked like Submit Run: the demo must be of that map, with that time (to
/// within 0.01, the game's rounding; the demo's own time is recorded) and have the key's owner in
/// it. Recorded as an auto-submission (`submission` 2); when the Steam sync already picked up the
/// same time, the demo goes on that run instead. Answers Submit Run's JSON (or `{ "changelog_id",
/// "attached": true }`), or 400 with the reason.
///
/// Example: `POST /api-v2/auto-submit` (multipart: `auth_hash`, `mapId=47458`, `score=1233`, `demoFile`=file)
#[post("/auto-submit")]
async fn auto_submit(req: HttpRequest, pool: web::Data<PgPool>, config: web::Data<Config>, cache: web::Data<CacheState>, payload: Multipart) -> Result<impl Responder> {
    if let Err(limited) = ratelimit::check(&req, &config, "upload", 10, Duration::from_secs(60)) {
        return Ok(limited);
    }
    let (owner, form) = match open(&req, &config, &pool, payload, true).await? {
        Ok(ok) => ok,
        Err(refused) => return Ok(refused),
    };
    let Some((map, bsp)) = form_map(&pool, &form).await? else {
        return Ok(bad("No valid Map Id Provided"));
    };
    let Some(score) = form.get("score").and_then(|s| s.parse::<i32>().ok()).filter(|s| *s > 0) else {
        return Ok(bad("No valid score provided"));
    };
    let Some(bytes) = form.demo.as_deref() else {
        return Ok(bad("No demo provided"));
    };
    if owner.frozen {
        return Ok(HttpResponse::Forbidden().body("This profile is frozen and can't get new times."));
    }

    let info = match parse_upload(&config, bytes).await {
        Ok(i) => i,
        Err(e) => return Ok(bad(e)),
    };
    let same_map = matches!((info.map_name.as_deref(), bsp.as_deref()), (Some(a), Some(b)) if a.eq_ignore_ascii_case(b));
    if !same_map {
        return Ok(bad(format!("This demo is of {}, not {}.", info.map_name.as_deref().unwrap_or("another map"), map.name)));
    }
    let demo_score = match info.time_score {
        Some(t) if (t - score).abs() <= 1 => t,
        Some(t) => return Ok(bad(format!("The demo's time is {}, not {}.", submissions::format_time(t), submissions::format_time(score)))),
        None => return Ok(bad("This demo doesn't contain a finished challenge mode run.")),
    };
    if !info.players.iter().any(|p| p.steam_id == owner.profile_number) {
        return Ok(bad("This demo doesn't have you in it."));
    }
    let partner = map
        .is_coop
        .then(|| info.players.iter().find(|p| p.steam_id != owner.profile_number))
        .flatten()
        .map(|p| (p.steam_id.clone(), Some(p.name.clone())));

    // The Steam sync may have recorded this time already, without a demo: the demo goes on it.
    if let Some(id) = autosubmit::run_waiting_for_demo(&pool, &map, &owner.profile_number, demo_score).await? {
        if let Some(run) = submissions::proof_target(&pool, id).await? {
            let name = format!("{}_{}_{}_{}.dem", map.steam_id, demo_score, owner.profile_number, &crate::tools::auth::random_token()[..10]);
            if let Err(e) = save_demo(&config, bytes, &name).await {
                return Ok(bad(e));
            }
            let partner_name = partner.as_ref().and_then(|(_, n)| n.as_deref());
            submissions::attach_proof(&pool, &run, &name, partner_name, info.portal_score).await?;
            cache.update_current_state(if map.is_coop { COOP_PREVIEWS } else { SP_PREVIEWS }, false).await;
            if cache.default_cat_ids.contains_key(&map.steam_id) {
                cache.reload_rank(&pool, &map.steam_id, &config, map.is_coop).await;
            }
            invalidate_points().await;
            return Ok(HttpResponse::Ok().json(json!({ "changelog_id": id, "attached": true })));
        }
    }

    let submission = Submission {
        map,
        profile_number: owner.profile_number,
        score: demo_score,
        partner,
        demo: Some(bytes),
        note: None,
        youtube_id: None,
        portals: info.portal_score,
        submission: 2,
    };
    Ok(match record_submission(&pool, &config, &cache, submission).await? {
        Ok(done) => HttpResponse::Ok().json(done.response()),
        Err(refused) => refused,
    })
}
