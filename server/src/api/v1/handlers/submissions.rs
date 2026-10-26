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
        ratelimit,
        upload_slots::UPLOADS,
    },
};
use actix_multipart::Multipart;
use actix_files::NamedFile;
use actix_web::{get, http::header, post, web, HttpRequest, HttpResponse, Responder};
use futures::{future::LocalBoxFuture, StreamExt};
use serde_json::json;
use sqlx::PgPool;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    time::Duration,
};

/// Largest demo accepted.
const MAX_DEMO_BYTES: usize = 50 * 1024 * 1024;
const MAX_FIELD_BYTES: usize = 4096;
/// Most fields a form may have (Submit Run sends at most 9).
const MAX_FORM_PARTS: usize = 20;
/// A co-op partner adding their demo of a run a second time.
const ALREADY_ADDED: &str = "You've already added your demo of this run.";

pub(crate) struct Form {
    pub demo: Option<Vec<u8>>,
    fields: HashMap<String, String>,
}

impl Form {
    pub fn get(&self, name: &str) -> Option<&str> {
        self.fields.get(name).map(|s| s.trim()).filter(|s| !s.is_empty())
    }
}

/// Whether a form may carry a demo file.
pub(crate) enum DemoField<'a> {
    /// No file: refused outright (so forms that never carry one can't be used to upload 50 MB).
    Refused,
    Allowed,
    /// Allowed once the check passes, given the text fields sent before the file and run before any
    /// of it is read: SAR's auto-submit checks the key (which SAR sends first) so a client without one
    /// can't make the server buffer an upload. A failed check stops the read with an error.
    Checked(Box<dyn FnOnce(&HashMap<String, String>) -> LocalBoxFuture<'a, bool> + 'a>),
}

/// Reads a form: the demo file (field `demo`, or `demoFile` as SAR sends it) and short text fields.
pub(crate) async fn read_form(payload: Multipart) -> std::result::Result<Form, String> {
    read_form_with(payload, DemoField::Allowed).await
}

/// [read_form], with a choice about the demo file (see [DemoField]).
pub(crate) async fn read_form_with(mut payload: Multipart, mut demo_field: DemoField<'_>) -> std::result::Result<Form, String> {
    let mut form = Form { demo: None, fields: HashMap::new() };
    let mut parts = 0;
    while let Some(field) = payload.next().await {
        let mut field = field.map_err(|e| format!("Upload failed: {e}"))?;
        parts += 1;
        if parts > MAX_FORM_PARTS {
            return Err("Too many form fields.".into());
        }
        let is_demo = matches!(field.name(), Some("demo" | "demoFile"));
        if is_demo {
            if matches!(demo_field, DemoField::Refused) {
                return Err("This request doesn't take a file.".into());
            }
            // The check runs once, for the first file; it stays refused or becomes allowed.
            if matches!(demo_field, DemoField::Checked(_)) {
                if let DemoField::Checked(check) = std::mem::replace(&mut demo_field, DemoField::Allowed) {
                    if !check(&form.fields).await {
                        return Err("Refused before the upload.".into());
                    }
                }
            }
        }
        let name = if is_demo { "demo".to_string() } else { field.name().unwrap_or("").to_string() };
        let limit = if is_demo { MAX_DEMO_BYTES } else { MAX_FIELD_BYTES };
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

pub(crate) fn bad(msg: impl Into<String>) -> HttpResponse {
    HttpResponse::BadRequest().body(msg.into())
}

/// Saves upload bytes under the demo storage directory and returns the path.
pub(crate) async fn save_demo(config: &Config, bytes: &[u8], name: &str) -> std::result::Result<PathBuf, String> {
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
pub(crate) async fn parse_upload(config: &Config, bytes: &[u8]) -> std::result::Result<DemoInfo, String> {
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
async fn submission_preview(req: HttpRequest, _user: SignedIn, pool: web::Data<PgPool>, config: web::Data<Config>, payload: Multipart) -> Result<impl Responder> {
    if let Err(limited) = ratelimit::check(&req, &config, "upload", 10, Duration::from_secs(60)) {
        return Ok(limited);
    }
    // One of the server's upload slots, held until this answers (see tools::upload_slots).
    let _slot = match UPLOADS.take().await {
        Ok(slot) => slot,
        Err(busy) => return Ok(busy),
    };
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
    req: HttpRequest,
    user: SignedIn,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    cache: web::Data<CacheState>,
    payload: Multipart,
) -> Result<impl Responder> {
    if let Err(limited) = ratelimit::check(&req, &config, "upload", 10, Duration::from_secs(60)) {
        return Ok(limited);
    }
    let user = user.0;
    let is_admin = user.is_role_admin();
    // One of the server's upload slots, held until this answers (see tools::upload_slots).
    let _slot = match UPLOADS.take().await {
        Ok(slot) => slot,
        Err(busy) => return Ok(busy),
    };
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
    let note = form.get("comment").map(|c| c.chars().take(500).collect::<String>());
    let youtube = match form.get("youtube") {
        Some(y) => match submissions::youtube_id(y) {
            Some(id) => Some(id),
            None => return Ok(bad("That doesn't look like a YouTube link.")),
        },
        None => None,
    };
    let submission = Submission {
        map,
        profile_number,
        score,
        partner,
        demo: form.demo.as_deref(),
        note,
        youtube_id: youtube,
        // Only when the time is the demo's own.
        portals: info.as_ref().filter(|i| i.time_score == Some(score)).and_then(|i| i.portal_score),
        submission: 1,
    };
    let done = match record_submission(pool.get_ref(), &config, &cache, submission).await? {
        Ok(done) => done,
        Err(refused) => return Ok(refused),
    };
    if !overrides.is_empty() {
        let details = json!({ "entered_by_hand": overrides, "map_id": done.recorded.map.steam_id, "score": score, "profile_number": done.profile_number, "partner": done.partner, "demo": done.demo_file.is_some() });
        moderation::log_by_user(pool.get_ref(), &user.profile_number, "run.manual_submit", "run", &done.recorded.changelog_id.to_string(), details).await?;
    }
    Ok(HttpResponse::Ok().json(done.response()))
}

/// A run to record once its map, time and players are known (Submit Run, and SAR's auto-submit).
pub(crate) struct Submission<'a> {
    pub map: BoardMap,
    pub profile_number: String,
    pub score: i32,
    /// Co-op partner: SteamID, and the name the demo shows for them.
    pub partner: Option<(String, Option<String>)>,
    pub demo: Option<&'a [u8]>,
    pub note: Option<String>,
    pub youtube_id: Option<String>,
    pub portals: Option<i32>,
    /// changelog.submission: 1 Submit Run, 2 auto-submit (as the old boards).
    pub submission: i32,
}

/// A recorded run.
pub(crate) struct Submitted {
    pub recorded: submissions::Recorded,
    pub profile_number: String,
    pub score: i32,
    pub partner: Option<String>,
    pub demo_file: Option<String>,
}

impl Submitted {
    /// The answer Submit Run gives.
    pub fn response(&self) -> serde_json::Value {
        json!({
            "changelog_id": self.recorded.changelog_id,
            "map_id": self.recorded.map.steam_id,
            "map_name": self.recorded.map.name,
            "score": self.score,
            "partner": self.partner,
            "boards": self.recorded.boards,
            "waiting_for_partner": self.recorded.waiting_for_partner,
        })
    }
}

/// Records a submitted run: creates the co-op partner's account if needed, keeps the demo, records
/// the run (refused when it isn't an improvement) and refreshes the caches it shows in. `Err` holds
/// the answer for a refused run.
pub(crate) async fn record_submission(pool: &PgPool, config: &Config, cache: &CacheState, s: Submission<'_>) -> Result<std::result::Result<Submitted, HttpResponse>> {
    if let Some((pid, _)) = &s.partner {
        if Users::get_user(pool, pid.clone()).await?.is_none() {
            match Users::new_from_steam(&config.steam.api_key, pid).await {
                Ok(u) => {
                    Users::insert_new_users(pool, u).await?;
                }
                Err(_) => return Ok(Err(bad("The co-op partner's Steam account couldn't be found."))),
            }
        }
    }

    // Keep the demo file.
    let demo_file = match s.demo {
        Some(bytes) => {
            let name = format!("{}_{}_{}_{}.dem", s.map.steam_id, s.score, s.profile_number, &crate::tools::auth::random_token()[..10]);
            match save_demo(config, bytes, &name).await {
                Ok(_) => Some(name),
                Err(e) => return Ok(Err(bad(e))),
            }
        }
        None => None,
    };

    let run = NewRun {
        map: &s.map,
        profile_number: &s.profile_number,
        score: s.score,
        youtube_id: s.youtube_id,
        note: s.note,
        partner: s.partner.as_ref().map(|(p, _)| p.as_str()),
        demo_file: demo_file.clone(),
        demo_partner_name: s.partner.as_ref().and_then(|(_, n)| n.clone()),
        portals: s.portals,
        submission: s.submission,
        verified: None,
    };
    let recorded = match submissions::insert_run(pool, run).await? {
        Ok(r) => r,
        Err(refused) => {
            if let (Some(name), Some(dir)) = (&demo_file, config.demo.storage.as_deref()) {
                let _ = tokio::fs::remove_file(Path::new(dir).join(name)).await;
            }
            return Ok(Err(match refused {
                Refused::NotFound(m) => HttpResponse::NotFound().body(m),
                Refused::Invalid(m) => bad(m),
            }));
        }
    };

    cache.update_current_state(if s.map.is_coop { COOP_PREVIEWS } else { SP_PREVIEWS }, false).await;
    if cache.default_cat_ids.contains_key(&recorded.map.steam_id) {
        cache.reload_rank(pool, &recorded.map.steam_id, config, s.map.is_coop).await;
    }
    invalidate_points().await;
    Ok(Ok(Submitted { recorded, profile_number: s.profile_number, score: s.score, partner: s.partner.map(|p| p.0), demo_file }))
}

/// **POST** Add the demo for a pending run (form field `demo`). The demo must be of the run's
/// map, with the run's exact time, and have the uploader in it; the run is then verified.
/// The run's player (or co-op partner) can do this, and staff for anyone's run. A partner's demo
/// goes on their own half; a new co-op run in the top 200 is verified once both players have one.
///
/// A co-op partner the run wasn't a personal best for (no run of their own in it) can add their
/// demo of it too, also once the run is verified: it's kept as the run's partner demo, so the run
/// has both players' views (it can't be the same file as the other player's demo). It shows as
/// that player's `demo_id` in `/coop/{id}/halves` and on the co-op map board.
///
/// Example: `POST /api/v1/runs/123456/demo` (multipart, `demo`=file)
///
/// Responds `{ "verified": bool }`.
#[post("/runs/{id}/demo")]
async fn run_add_demo(
    req: HttpRequest,
    user: SignedIn,
    pool: web::Data<PgPool>,
    config: web::Data<Config>,
    cache: web::Data<CacheState>,
    id: web::Path<i64>,
    payload: Multipart,
) -> Result<impl Responder> {
    if let Err(limited) = ratelimit::check(&req, &config, "upload", 10, Duration::from_secs(60)) {
        return Ok(limited);
    }
    let user = user.0;
    let Some(run) = submissions::proof_target(pool.get_ref(), id.into_inner()).await? else {
        return Ok(HttpResponse::NotFound().body("No such run."));
    };
    let players: Vec<String> = [Some(run.profile_number.as_str()), run.p_id1.as_deref(), run.p_id2.as_deref()]
        .into_iter()
        .flatten()
        .filter(|p| *p != moderation::FILLER)
        .map(str::to_string)
        .collect();
    let staff = user.is_admin();
    if !staff && !players.contains(&user.profile_number) {
        return Ok(HttpResponse::Forbidden().body("You can only add demos to your own runs."));
    }
    // A co-op partner's demo goes on their own half of the run, or, when the run wasn't a personal
    // best for them (no half of their own), it's the run's partner demo.
    let mut run = run;
    let mut partner_demo = false;
    if let Some(coop_id) = run.coop_id.filter(|_| user.profile_number != run.profile_number && players.contains(&user.profile_number)) {
        let own: Option<i64> = sqlx::query_scalar(
            "SELECT cl.id FROM coop_bundled AS cb JOIN changelog AS cl ON cl.id IN (cb.cl_id1, cb.cl_id2) WHERE cb.id = $1 AND cl.profile_number = $2",
        )
        .bind(coop_id)
        .bind(&user.profile_number)
        .fetch_optional(pool.get_ref())
        .await?;
        match own {
            Some(own_id) => match submissions::proof_target(pool.get_ref(), own_id).await? {
                Some(half) => run = half,
                None => return Ok(HttpResponse::NotFound().body("No such run.")),
            },
            None => match submissions::partner_demo_slot(pool.get_ref(), coop_id, &user.profile_number).await? {
                Some(false) => partner_demo = true,
                Some(true) => return Ok(bad(ALREADY_ADDED)),
                None => return Ok(bad("This run's pairing has no place for your demo; staff can add it.")),
            },
        }
    }
    if run.banned {
        return Ok(bad("This run is hidden from the boards."));
    }
    if !partner_demo && run.verified == Some(true) {
        return Ok(bad("This run is already verified."));
    }
    if !partner_demo && run.demo_id.is_some() {
        return Ok(bad("This run already has a demo; staff will review it."));
    }
    // One of the server's upload slots, held until this answers (see tools::upload_slots).
    let _slot = match UPLOADS.take().await {
        Ok(slot) => slot,
        Err(busy) => return Ok(busy),
    };
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
    if !info.players.iter().any(|p| players.contains(&p.steam_id)) {
        return Ok(bad("This run's player isn't in this demo."));
    }
    if partner_demo {
        if !info.players.iter().any(|p| p.steam_id == user.profile_number) {
            return Ok(bad("You aren't in this demo."));
        }
        if same_as_run_demo(pool.get_ref(), &config, &run, bytes).await? {
            return Ok(bad("This is your partner's demo of the run. Add the one you recorded."));
        }
    }
    // Named after whose view it is.
    let owner = if partner_demo { &user.profile_number } else { &run.profile_number };
    let name = format!("{}_{}_{}_{}.dem", run.map_id, run.score, owner, &crate::tools::auth::random_token()[..10]);
    if let Err(e) = save_demo(&config, bytes, &name).await {
        return Ok(bad(e));
    }
    let partner_name = info.players.iter().find(|p| p.steam_id != *owner).map(|p| p.name.clone());
    let verified = if partner_demo {
        match submissions::attach_partner_demo(pool.get_ref(), &run, &name, partner_name.as_deref()).await? {
            Some(verified) => verified,
            None => return Ok(bad(ALREADY_ADDED)),
        }
    } else {
        submissions::attach_proof(pool.get_ref(), &run, &name, if run.is_coop { partner_name.as_deref() } else { None }, info.portal_score).await?
    };

    cache.update_current_state(if run.is_coop { COOP_PREVIEWS } else { SP_PREVIEWS }, false).await;
    if cache.default_cat_ids.contains_key(&run.map_id) {
        cache.reload_rank(pool.get_ref(), &run.map_id, &config, run.is_coop).await;
    }
    invalidate_points().await;
    // `verified` false: a co-op run still waiting for the other player's demo.
    Ok(HttpResponse::Ok().json(json!({ "verified": verified })))
}

/// Whether `bytes` is the same file as the demo `run` already has.
async fn same_as_run_demo(pool: &PgPool, config: &Config, run: &submissions::ProofTarget, bytes: &[u8]) -> Result<bool> {
    let Some(demo_id) = run.demo_id else {
        return Ok(false);
    };
    let file: Option<String> = sqlx::query_scalar("SELECT file_id FROM demos WHERE id = $1").bind(demo_id).fetch_optional(pool).await?;
    let Some(file) = file else {
        return Ok(false);
    };
    let Some(path) = crate::tools::demo_files::locate(&config.demo, &file, Some(run.id)).await else {
        return Ok(false);
    };
    Ok(tokio::fs::read(&path).await.is_ok_and(|existing| existing == bytes))
}

/// **GET** Download a demo by its id (as runs list it in `demo_id`).
#[get("/demos/{demo_id}/file")]
async fn demo_download(req: HttpRequest, pool: web::Data<PgPool>, config: web::Data<Config>, demo_id: web::Path<i64>) -> Result<impl Responder> {
    if let Err(limited) = ratelimit::check(&req, &config, "download", 120, Duration::from_secs(60)) {
        return Ok(limited);
    }
    let row: Option<(String, Option<i64>)> = sqlx::query_as(
        "SELECT d.file_id, (SELECT MIN(cl.id)::bigint FROM changelog AS cl WHERE cl.demo_id = d.id) FROM demos AS d WHERE d.id = $1",
    )
    .bind(demo_id.into_inner())
    .fetch_optional(pool.get_ref())
    .await?;
    let Some((file, changelog_id)) = row else {
        return Ok(HttpResponse::NotFound().body("No such demo."));
    };
    let Some(path) = crate::tools::demo_files::locate(&config.demo, &file, changelog_id).await else {
        return Ok(HttpResponse::NotFound().body("This demo's file isn't available."));
    };
    // Streamed from disk (not read into memory), with ranges, ETag and Last-Modified so a
    // browser that already has it gets a 304.
    let named = match NamedFile::open_async(&path).await {
        Ok(f) => f,
        Err(e) => {
            log::error!("demo download {}: {e}", path.display());
            return Ok(HttpResponse::NotFound().body("This demo's file isn't available."));
        }
    };
    let disposition = header::ContentDisposition {
        disposition: header::DispositionType::Attachment,
        parameters: vec![header::DispositionParam::Filename(file.replace('"', ""))],
    };
    let mut res = named
        .set_content_type(mime::APPLICATION_OCTET_STREAM)
        .set_content_disposition(disposition)
        .use_etag(true)
        .use_last_modified(true)
        .into_response(&req);
    res.headers_mut().insert(header::CACHE_CONTROL, header::HeaderValue::from_static("public, max-age=86400"));
    Ok(res)
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
