//! Run submission endpoints (multipart form uploads).
//!
//! - `POST /submissions/preview` reads a demo and returns what it contains (map, time, players)
//!   without saving anything.
//! - `POST /submissions` submits a run. Players submit from their own demo (the map and time
//!   come from it). Admins may also set `map_id`, `time`, `profile_number` and `partner` by hand,
//!   with or without a demo; those submissions are recorded in the audit log.
//!
//! Form fields: `demo` (file), `youtube`, `comment`, `mel_mode` ("story" / "advanced", for Mel
//! demos), and the admin-only fields above.
use crate::{
    controllers::{
        moderation::{self, Refused},
        submissions::{self, BoardMap, DemoInfo, NewRun},
    },
    models::users::Users,
    tools::{
        auth::SignedIn,
        cache::{CacheState, COOP_PREVIEWS, SP_PREVIEWS},
        config::Config,
        error::Result,
        points_cache::invalidate_points,
    },
};
use actix_multipart::Multipart;
use actix_web::{post, web, HttpResponse, Responder};
use futures::StreamExt;
use serde_json::json;
use sqlx::PgPool;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};

/// Largest demo accepted.
const MAX_DEMO_BYTES: usize = 50 * 1024 * 1024;
const MAX_FIELD_BYTES: usize = 4096;

struct Form {
    demo: Option<Vec<u8>>,
    fields: HashMap<String, String>,
}

impl Form {
    fn get(&self, name: &str) -> Option<&str> {
        self.fields.get(name).map(|s| s.trim()).filter(|s| !s.is_empty())
    }
}

async fn read_form(mut payload: Multipart) -> std::result::Result<Form, String> {
    let mut form = Form { demo: None, fields: HashMap::new() };
    while let Some(field) = payload.next().await {
        let mut field = field.map_err(|e| format!("Upload failed: {e}"))?;
        let name = field.name().unwrap_or("").to_string();
        let limit = if name == "demo" { MAX_DEMO_BYTES } else { MAX_FIELD_BYTES };
        let mut data = Vec::new();
        while let Some(chunk) = field.next().await {
            let chunk = chunk.map_err(|e| format!("Upload failed: {e}"))?;
            if data.len() + chunk.len() > limit {
                return Err(if name == "demo" { "That demo is too large (50 MB max).".into() } else { format!("The {name} field is too long.") });
            }
            data.extend_from_slice(&chunk);
        }
        if name == "demo" {
            if !data.is_empty() {
                form.demo = Some(data);
            }
        } else {
            form.fields.insert(name, String::from_utf8_lossy(&data).into_owned());
        }
    }
    Ok(form)
}

fn bad(msg: impl Into<String>) -> HttpResponse {
    HttpResponse::BadRequest().body(msg.into())
}

/// Saves upload bytes under the demo storage directory and returns the path.
async fn save_demo(config: &Config, bytes: &[u8], name: &str) -> std::result::Result<PathBuf, String> {
    let dir = config.demo.storage.as_deref().filter(|d| !d.is_empty()).ok_or("Demo uploads aren't set up on this server.")?;
    tokio::fs::create_dir_all(dir).await.map_err(|e| {
        log::error!("demo storage: {e}");
        "Demo uploads aren't available right now.".to_string()
    })?;
    let path = Path::new(dir).join(sanitize_filename::sanitize(name));
    tokio::fs::write(&path, bytes).await.map_err(|e| {
        log::error!("demo storage: {e}");
        "Demo uploads aren't available right now.".to_string()
    })?;
    Ok(path)
}

/// Parses an uploaded demo via a temporary file.
async fn parse_upload(config: &Config, bytes: &[u8]) -> std::result::Result<DemoInfo, String> {
    if bytes.len() < 1072 || &bytes[..8] != b"HL2DEMO\0" {
        return Err("That file isn't a Source engine demo (.dem).".into());
    }
    let path = save_demo(config, bytes, &format!("upload_{}.dem.tmp", crate::tools::auth::random_token())).await?;
    let info = submissions::parse_demo(&config.demo, &path).await;
    let _ = tokio::fs::remove_file(&path).await;
    info
}

/// The board map a demo is for (Mel's shared Story/Advanced maps use `mel_mode`).
fn pick_map(candidates: Vec<BoardMap>, mel_mode: Option<&str>) -> Option<BoardMap> {
    if candidates.len() > 1 {
        if let Some(mode) = mel_mode {
            if let Some(m) = candidates.iter().find(|m| m.game_mode == mode) {
                return Some(m.clone());
            }
        }
    }
    candidates.into_iter().next()
}

/// "1:23.45", "23.45" or centiseconds ("2345") → centiseconds.
fn parse_time(input: &str) -> Option<i32> {
    let s = input.trim();
    if s.chars().all(|c| c.is_ascii_digit()) {
        return s.parse().ok().filter(|&v: &i32| v > 0);
    }
    let (min, rest) = match s.split_once(':') {
        Some((m, r)) => (m.parse::<i32>().ok()?, r),
        None => (0, s),
    };
    let (sec, hund) = rest.split_once('.')?;
    let sec: i32 = sec.parse().ok()?;
    let hund: i32 = format!("{hund:0<2}")[..2].parse().ok()?;
    (sec < 60 || min == 0).then_some(min * 6000 + sec * 100 + hund).filter(|&v| v > 0)
}

/// **POST** Read a demo and return what it contains, for the submission form.
///
/// ```json
/// { "mapName": "sp_a1_intro3", "timeScore": 2243, "players": [...], "maps": [{ "steam_id": "47458", "name": "Portal Gun", ... }] }
/// ```
#[post("/submissions/preview")]
async fn submission_preview(_user: SignedIn, pool: web::Data<PgPool>, config: web::Data<Config>, payload: Multipart) -> Result<impl Responder> {
    let form = match read_form(payload).await {
        Ok(f) => f,
        Err(e) => return Ok(bad(e)),
    };
    let Some(bytes) = form.demo.as_deref() else {
        return Ok(bad("Choose a demo file."));
    };
    let info = match parse_upload(&config, bytes).await {
        Ok(i) => i,
        Err(e) => return Ok(bad(e)),
    };
    let maps = match info.map_name.as_deref() {
        Some(bsp) => submissions::maps_for_bsp(pool.get_ref(), bsp).await?,
        None => Vec::new(),
    };
    Ok(HttpResponse::Ok().json(json!({
        "mapName": info.map_name,
        "clientName": info.client_name,
        "timeScore": info.time_score,
        "portalScore": info.portal_score,
        "players": info.players,
        "maps": maps,
    })))
}

/// **POST** Submit a run.
#[post("/submissions")]
async fn submission_create(
    user: SignedIn,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    cache: web::Data<CacheState>,
    payload: Multipart,
) -> Result<impl Responder> {
    let user = user.0;
    let is_admin = user.is_role_admin();
    let form = match read_form(payload).await {
        Ok(f) => f,
        Err(e) => return Ok(bad(e)),
    };
    let overrides: Vec<&str> = ["map_id", "time", "profile_number", "partner"].into_iter().filter(|k| form.get(k).is_some()).collect();
    if !overrides.is_empty() && !is_admin {
        return Ok(HttpResponse::Forbidden().body("Only admins can enter the map, time or players by hand."));
    }

    // The demo, when there is one.
    let info = match form.demo.as_deref() {
        Some(bytes) => match parse_upload(&config, bytes).await {
            Ok(i) => Some(i),
            Err(e) => return Ok(bad(e)),
        },
        None if is_admin => None,
        None => return Ok(bad("Add the demo of your run.")),
    };

    // Map: the admin's choice, else the demo's.
    let map = match (form.get("map_id"), info.as_ref().and_then(|i| i.map_name.as_deref())) {
        (Some(id), _) => submissions::map_by_id(pool.get_ref(), id).await?,
        (None, Some(bsp)) => pick_map(submissions::maps_for_bsp(pool.get_ref(), bsp).await?, form.get("mel_mode")),
        (None, None) => None,
    };
    let Some(map) = map else {
        let bsp = info.as_ref().and_then(|i| i.map_name.clone()).unwrap_or_default();
        return Ok(bad(if bsp.is_empty() { "Choose the map.".to_string() } else { format!("This demo's map ({bsp}) isn't a challenge mode map on the boards.") }));
    };

    // Time: the admin's entry, else the demo's scoreboard time.
    let score = match (form.get("time"), info.as_ref().and_then(|i| i.time_score)) {
        (Some(t), _) => match parse_time(t) {
            Some(cs) => cs,
            None => return Ok(bad("Enter the time as 1:23.45 or 23.45.")),
        },
        (None, Some(cs)) if cs > 0 => cs,
        _ => return Ok(bad("This demo doesn't contain a finished challenge mode run.")),
    };

    // Player: the admin's choice, else the signed-in player, who must be in the demo.
    let profile_number = form.get("profile_number").unwrap_or(&user.profile_number).to_string();
    let players = info.as_ref().map(|i| i.players.clone()).unwrap_or_default();
    if !is_admin && !players.iter().any(|p| p.steam_id == profile_number) {
        return Ok(bad("This demo doesn't have you in it. You can only submit your own runs."));
    }
    let Some(account) = Users::get_user(pool.get_ref(), profile_number.clone()).await? else {
        return Ok(bad("No such player."));
    };
    if account.banned || account.frozen {
        return Ok(HttpResponse::Forbidden().body(if account.frozen { "This profile is frozen and can't get new times." } else { "This account is banned." }));
    }

    // Co-op partner: the admin's choice, else the other player in the demo.
    let partner: Option<(String, Option<String>)> = if map.is_coop {
        match form.get("partner") {
            Some(p) => Some((p.to_string(), None)),
            None => players.iter().find(|p| p.steam_id != profile_number).map(|p| (p.steam_id.clone(), Some(p.name.clone()))),
        }
    } else {
        None
    };
    if let Some((pid, _)) = &partner {
        if Users::get_user(pool.get_ref(), pid.clone()).await?.is_none() {
            match Users::new_from_steam(&config.steam.api_key, pid).await {
                Ok(u) => {
                    Users::insert_new_users(pool.get_ref(), u).await?;
                }
                Err(_) => return Ok(bad("The co-op partner's Steam account couldn't be found.")),
            }
        }
    }

    // Keep the demo file.
    let demo_file = match form.demo.as_deref() {
        Some(bytes) => {
            let name = format!("{}_{}_{}_{}.dem", map.steam_id, score, profile_number, &crate::tools::auth::random_token()[..10]);
            match save_demo(&config, bytes, &name).await {
                Ok(_) => Some(name),
                Err(e) => return Ok(bad(e)),
            }
        }
        None => None,
    };

    let note = form.get("comment").map(|c| c.chars().take(500).collect::<String>());
    let youtube = match form.get("youtube") {
        Some(y) => match submissions::youtube_id(y) {
            Some(id) => Some(id),
            None => return Ok(bad("That doesn't look like a YouTube link.")),
        },
        None => None,
    };
    let run = NewRun {
        map: &map,
        profile_number: &profile_number,
        score,
        youtube_id: youtube,
        note,
        partner: partner.as_ref().map(|(p, _)| p.as_str()),
        demo_file: demo_file.clone(),
        demo_partner_name: partner.as_ref().and_then(|(_, n)| n.clone()),
    };
    let id = match submissions::insert_run(pool.get_ref(), run).await? {
        Ok(id) => id,
        Err(refused) => {
            if let (Some(name), Some(dir)) = (&demo_file, config.demo.storage.as_deref()) {
                let _ = tokio::fs::remove_file(Path::new(dir).join(name)).await;
            }
            return Ok(match refused {
                Refused::NotFound(m) => HttpResponse::NotFound().body(m),
                Refused::Invalid(m) => bad(m),
            });
        }
    };

    if !overrides.is_empty() {
        let details = json!({ "entered_by_hand": overrides, "map_id": map.steam_id, "score": score, "profile_number": profile_number, "partner": partner.as_ref().map(|p| &p.0), "demo": demo_file.is_some() });
        moderation::log_by_user(pool.get_ref(), &user.profile_number, "run.manual_submit", "run", &id.to_string(), details).await?;
    }
    cache.update_current_state(if map.is_coop { COOP_PREVIEWS } else { SP_PREVIEWS }, false).await;
    if cache.default_cat_ids.contains_key(&map.steam_id) {
        cache.reload_rank(pool.get_ref(), &map.steam_id, &config, map.is_coop).await;
    }
    invalidate_points().await;

    Ok(HttpResponse::Ok().json(json!({ "changelog_id": id, "map_id": map.steam_id, "map_name": map.name, "score": score, "partner": partner.map(|p| p.0) })))
}

/// **POST** Add the demo for a pending run (form field `demo`). The demo must be of the run's
/// map, with the run's exact time, and have the uploader in it; the run is then verified.
/// The run's player (or co-op partner) can do this, and staff for anyone's run.
#[post("/runs/{id}/demo")]
async fn run_add_demo(
    user: SignedIn,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    cache: web::Data<CacheState>,
    id: web::Path<i64>,
    payload: Multipart,
) -> Result<impl Responder> {
    let user = user.0;
    let Some(run) = submissions::proof_target(pool.get_ref(), id.into_inner()).await? else {
        return Ok(HttpResponse::NotFound().body("No such run."));
    };
    let players: Vec<&str> = [Some(run.profile_number.as_str()), run.p_id1.as_deref(), run.p_id2.as_deref()]
        .into_iter()
        .flatten()
        .filter(|p| *p != moderation::FILLER)
        .collect();
    let staff = user.is_admin();
    if !staff && !players.contains(&user.profile_number.as_str()) {
        return Ok(HttpResponse::Forbidden().body("You can only add demos to your own runs."));
    }
    if run.banned {
        return Ok(bad("This run is hidden from the boards."));
    }
    if run.verified == Some(true) {
        return Ok(bad("This run is already verified."));
    }
    if run.demo_id.is_some() {
        return Ok(bad("This run already has a demo; staff will review it."));
    }
    let form = match read_form(payload).await {
        Ok(f) => f,
        Err(e) => return Ok(bad(e)),
    };
    let Some(bytes) = form.demo.as_deref() else {
        return Ok(bad("Choose a demo file."));
    };
    let info = match parse_upload(&config, bytes).await {
        Ok(i) => i,
        Err(e) => return Ok(bad(e)),
    };
    let same_map = matches!((info.map_name.as_deref(), run.bsp_name.as_deref()), (Some(a), Some(b)) if a.eq_ignore_ascii_case(b));
    if !same_map {
        return Ok(bad(format!("This demo is of {}, not this run's map.", info.map_name.as_deref().unwrap_or("another map"))));
    }
    if info.time_score != Some(run.score) {
        return Ok(bad(match info.time_score {
            Some(t) => format!("This demo's time is {}, but the run is {}.", submissions::format_time(t), submissions::format_time(run.score)),
            None => "This demo doesn't contain a finished challenge mode run.".to_string(),
        }));
    }
    if !info.players.iter().any(|p| players.contains(&p.steam_id.as_str())) {
        return Ok(bad("This run's player isn't in this demo."));
    }
    let name = format!("{}_{}_{}_{}.dem", run.map_id, run.score, run.profile_number, &crate::tools::auth::random_token()[..10]);
    if let Err(e) = save_demo(&config, bytes, &name).await {
        return Ok(bad(e));
    }
    let partner_name = info.players.iter().find(|p| p.steam_id != run.profile_number).map(|p| p.name.clone());
    submissions::attach_proof(pool.get_ref(), &run, &name, if run.is_coop { partner_name.as_deref() } else { None }).await?;

    cache.update_current_state(if run.is_coop { COOP_PREVIEWS } else { SP_PREVIEWS }, false).await;
    if cache.default_cat_ids.contains_key(&run.map_id) {
        cache.reload_rank(pool.get_ref(), &run.map_id, &config, run.is_coop).await;
    }
    invalidate_points().await;
    Ok(HttpResponse::NoContent().finish())
}

#[cfg(test)]
mod tests {
    use super::parse_time;

    #[test]
    fn times() {
        assert_eq!(parse_time("1:23.45"), Some(8345));
        assert_eq!(parse_time("23.4"), Some(2340));
        assert_eq!(parse_time("2345"), Some(2345));
        assert_eq!(parse_time("1:75.00"), None);
        assert_eq!(parse_time("abc"), None);
    }
}
