//! Per-run endpoints: co-op halves and reactions.
use crate::{
    controllers::runs,
    tools::{
        auth::{AdminOrService, MaybeUser, SignedIn},
        error::Result,
    },
};
use actix_web::{delete, get, post, put, web, HttpResponse, Responder};
use sqlx::PgPool;

/// **GET** Both players' halves of a co-op run (blue / host first when known): each player's
/// own changelog entry with its demo, video, comment and whether it has mtrigger segments.
///
/// ## Example endpoint
/// - `/api/v1/coop/19041/halves`
#[get("/coop/{coop_id}/halves")]
async fn coop_halves(pool: web::Data<PgPool>, coop_id: web::Path<i64>) -> Result<impl Responder> {
    let halves = runs::coop_halves(pool.get_ref(), coop_id.into_inner()).await?;
    Ok(if halves.is_empty() { HttpResponse::NotFound().body("No such co-op run.") } else { HttpResponse::Ok().json(halves) })
}

/// **GET** Thumbs up / down counts for a run, and the signed-in viewer's own reaction
/// (`mine`: 1 up, -1 down, null none). A co-op run's halves share their reactions.
///
/// ```json
/// { "up": 12, "down": 1, "mine": 1 }
/// ```
#[get("/runs/{id}/reactions")]
async fn run_reactions(pool: web::Data<PgPool>, user: MaybeUser, id: web::Path<i64>) -> Result<impl Responder> {
    let viewer = user.0.as_ref().map(|u| u.profile_number.as_str());
    Ok(match runs::reactions(pool.get_ref(), id.into_inner(), viewer).await? {
        Some(r) => HttpResponse::Ok().json(r),
        None => HttpResponse::NotFound().body("No such run."),
    })
}

#[derive(Deserialize)]
pub struct IdsQuery {
    /// Comma-separated changelog ids (up to 500).
    pub ids: String,
}

/// **GET** The signed-in viewer's reactions on several runs, as `{ "<id>": 1 | -1 }` (runs
/// without a reaction are left out; `{}` when signed out).
///
/// ## Example endpoint
/// - `/api/v1/runs/reactions/mine?ids=350308,350110`
#[get("/runs/reactions/mine")]
async fn my_run_reactions(pool: web::Data<PgPool>, user: MaybeUser, query: web::Query<IdsQuery>) -> Result<impl Responder> {
    let Some(user) = user.0 else {
        return Ok(HttpResponse::Ok().json(serde_json::json!({})));
    };
    let ids: Vec<i64> = query.ids.split(',').filter_map(|s| s.trim().parse().ok()).take(500).collect();
    let mine = runs::my_reactions(pool.get_ref(), &ids, &user.profile_number).await?;
    let map: serde_json::Map<String, serde_json::Value> = mine.into_iter().map(|(id, r)| (id.to_string(), r.into())).collect();
    Ok(HttpResponse::Ok().json(map))
}

#[derive(Deserialize)]
pub struct ReactionBody {
    /// "up", "down", or null to remove your reaction.
    pub reaction: Option<String>,
}

/// **PUT** React to a run (signed in): `{"reaction": "up" | "down" | null}`. Returns the new counts.
#[put("/runs/{id}/reaction")]
async fn run_react(pool: web::Data<PgPool>, user: SignedIn, id: web::Path<i64>, body: web::Json<ReactionBody>) -> Result<impl Responder> {
    let reaction = match body.reaction.as_deref() {
        Some("up") => Some(1),
        Some("down") => Some(-1),
        None => None,
        Some(_) => return Ok(HttpResponse::BadRequest().body("Reaction must be \"up\", \"down\" or null.")),
    };
    let id = id.into_inner();
    if !runs::set_reaction(pool.get_ref(), id, &user.0.profile_number, reaction).await? {
        return Ok(HttpResponse::NotFound().body("No such run."));
    }
    let counts = runs::reactions(pool.get_ref(), id, Some(&user.0.profile_number)).await?;
    Ok(HttpResponse::Ok().json(counts))
}

/// **GET** Staff: who reacted to a run (current reactions) and the latest 100 changes,
/// including changed and cleared reactions.
#[get("/admin/runs/{id}/reactions")]
async fn admin_run_reactions(_auth: AdminOrService, pool: web::Data<PgPool>, id: web::Path<i64>) -> Result<impl Responder> {
    Ok(match runs::reaction_record(pool.get_ref(), id.into_inner()).await? {
        Some(record) => HttpResponse::Ok().json(record),
        None => HttpResponse::NotFound().body("No such run."),
    })
}

fn refused(r: crate::controllers::moderation::Refused) -> HttpResponse {
    match r {
        crate::controllers::moderation::Refused::NotFound(m) => HttpResponse::NotFound().body(m),
        crate::controllers::moderation::Refused::Invalid(m) => HttpResponse::BadRequest().body(m),
    }
}

/// **GET** Staff: a run's staff-only notes, oldest first (a co-op run's halves share them):
/// `[{ id, author, author_name, avatar, body, created_at }]`.
#[get("/admin/runs/{id}/notes")]
async fn admin_run_notes(_auth: AdminOrService, pool: web::Data<PgPool>, id: web::Path<i64>) -> Result<impl Responder> {
    Ok(match crate::controllers::staff_notes::list(pool.get_ref(), id.into_inner()).await? {
        Some(notes) => HttpResponse::Ok().json(notes),
        None => HttpResponse::NotFound().body("No such run."),
    })
}

#[derive(serde::Deserialize)]
pub struct NoteBody {
    pub body: String,
}

/// **POST** Staff: add a note to a run (`{ "body" }`, up to 1000 characters). Answers `{ "id" }`.
#[post("/admin/runs/{id}/notes")]
async fn admin_run_note_add(auth: AdminOrService, pool: web::Data<PgPool>, id: web::Path<i64>, note: web::Json<NoteBody>) -> Result<impl Responder> {
    let author = match &auth {
        AdminOrService::Admin(u) => Some(u.profile_number.as_str()),
        AdminOrService::Service => None,
    };
    Ok(match crate::controllers::staff_notes::add(pool.get_ref(), id.into_inner(), author, &note.body).await? {
        Ok(id) => HttpResponse::Ok().json(serde_json::json!({ "id": id })),
        Err(r) => refused(r),
    })
}

/// **DELETE** Staff: delete one of your notes (the admin tier can delete anyone's).
#[delete("/admin/runs/notes/{note_id}")]
async fn admin_run_note_delete(auth: AdminOrService, pool: web::Data<PgPool>, note_id: web::Path<i64>) -> Result<impl Responder> {
    let (by, any) = match &auth {
        AdminOrService::Admin(u) => (Some(u.profile_number.as_str()), u.is_role_admin()),
        AdminOrService::Service => (None, true),
    };
    Ok(match crate::controllers::staff_notes::delete(pool.get_ref(), note_id.into_inner(), by, any).await? {
        Ok(()) => HttpResponse::NoContent().finish(),
        Err(r) => refused(r),
    })
}

#[derive(serde::Deserialize)]
pub struct SyncQuery {
    /// Only this map (its steam id), to try the sync on one map.
    pub map_id: Option<String>,
    /// Start it and answer straight away (202); its progress shows in `GET /admin/jobs`.
    #[serde(default)]
    pub background: bool,
}

/// The answer to a run started in the background.
fn started() -> HttpResponse {
    HttpResponse::Accepted().json(serde_json::json!({ "started": true }))
}

/// Who may run the background jobs by hand: the admin tier (and the board's services). Returns
/// the name the run is recorded under, or the refusal.
fn job_runner(auth: &AdminOrService, job: &'static str) -> std::result::Result<String, HttpResponse> {
    let name = match auth {
        AdminOrService::Admin(user) if !user.is_role_admin() => return Err(HttpResponse::Forbidden().body("Only admins can run the background jobs.")),
        AdminOrService::Admin(user) => user.user_name.clone(),
        AdminOrService::Service => "board service".to_string(),
    };
    if crate::tools::jobs::is_running(job) {
        return Err(HttpResponse::Conflict().body("That job is already running."));
    }
    Ok(name)
}

/// **GET** Admins: each background job, whether it's on, its schedule and its last run since the
/// server started (`running`, `started_at`, `finished_at`, `trigger`, `ok`, `summary`).
#[get("/admin/jobs")]
async fn admin_jobs(auth: AdminOrService, config: web::Data<crate::tools::config::Config>) -> Result<impl Responder> {
    if let AdminOrService::Admin(user) = &auth {
        if !user.is_role_admin() {
            return Ok(HttpResponse::Forbidden().body("Only admins can see the background jobs."));
        }
    }
    use crate::tools::jobs::{DEMO_PARSE, OLD_BOARDS, STEAM_SYNC};
    let runs = crate::tools::jobs::snapshot();
    let job = |key: &'static str, name: &str, enabled: bool, schedule: String| {
        serde_json::json!({ "key": key, "name": name, "enabled": enabled, "schedule": schedule, "last": runs.get(key) })
    };
    Ok(HttpResponse::Ok().json(serde_json::json!([
        job(STEAM_SYNC, "Steam sync", config.sync.steam(), format!("Every {} minutes", config.sync.minutes())),
        job(OLD_BOARDS, "Old-board pull", config.sync.old_boards(), crate::tools::old_boards_sync::schedule(&config)),
        job(DEMO_PARSE, "Demo parsing", config.demo.auto_parse(), "Every 10 minutes, and straight on while demos are waiting".to_string()),
    ])))
}

/// **POST** Pull new Portal 2 times from Steam's leaderboards now (admins; the schedule does
/// this every `SYNC.MINUTES`). `?map_id=` limits it to one map. Answers what the pass did.
#[post("/admin/steam_sync")]
async fn admin_steam_sync(
    auth: AdminOrService,
    pool: web::Data<crate::tools::jobs::JobsPool>,
    config: web::Data<crate::tools::config::Config>,
    cache: web::Data<crate::tools::cache::CacheState>,
    query: web::Query<SyncQuery>,
) -> Result<impl Responder> {
    use crate::tools::{jobs, steam_sync};
    let by = match job_runner(&auth, jobs::STEAM_SYNC) {
        Ok(by) => by,
        Err(r) => return Ok(r),
    };
    if query.background {
        let (pool, config, cache, only) = (pool.0.clone(), config.get_ref().clone(), cache.get_ref().clone(), query.map_id.clone());
        tokio::spawn(async move {
            let _ = jobs::track(jobs::STEAM_SYNC, &by, false, steam_sync::summary, steam_sync::run_once(&pool, &config, &cache, only.as_deref())).await;
        });
        return Ok(started());
    }
    let report = jobs::track(jobs::STEAM_SYNC, &by, false, steam_sync::summary, steam_sync::run_once(&pool.0, &config, &cache, query.map_id.as_deref())).await?;
    Ok(HttpResponse::Ok().json(report))
}

#[derive(serde::Deserialize)]
pub struct DemoParseQuery {
    /// Demos to read (default 50, at most 2000).
    pub limit: Option<i64>,
    /// Instead, read these runs' demos again (changelog ids, comma-separated).
    pub runs: Option<String>,
    /// Start it and answer straight away (202).
    #[serde(default)]
    pub background: bool,
}

/// **POST** Read a batch of demos that haven't been read yet now (admins; the background job does
/// this continuously), or `?runs=1,2,3` to read those runs' demos again. Answers what the batch
/// did and how many are left.
#[post("/admin/demo_parse")]
async fn admin_demo_parse(
    auth: AdminOrService,
    pool: web::Data<crate::tools::jobs::JobsPool>,
    config: web::Data<crate::tools::config::Config>,
    cache: web::Data<crate::tools::cache::CacheState>,
    query: web::Query<DemoParseQuery>,
) -> Result<impl Responder> {
    let limit = query.limit.unwrap_or(50).clamp(1, 2000);
    let runs: Option<Vec<i64>> = query.runs.as_deref().map(|r| r.split(',').filter_map(|id| id.trim().parse().ok()).collect());
    use crate::tools::{demo_parse, jobs};
    let by = match job_runner(&auth, jobs::DEMO_PARSE) {
        Ok(by) => by,
        Err(r) => return Ok(r),
    };
    if query.background {
        let (pool, config, cache) = (pool.0.clone(), config.get_ref().clone(), cache.get_ref().clone());
        tokio::spawn(async move {
            let _ = jobs::track(jobs::DEMO_PARSE, &by, false, demo_parse::summary, demo_parse::run_batch(&pool, &config, &cache, limit, runs.as_deref())).await;
        });
        return Ok(started());
    }
    let report = jobs::track(jobs::DEMO_PARSE, &by, false, demo_parse::summary, demo_parse::run_batch(&pool.0, &config, &cache, limit, runs.as_deref())).await?;
    Ok(HttpResponse::Ok().json(report))
}

/// **POST** Read one run's demo again now (the admin tier; a co-op run's partner demo too), as
/// `/admin/demo_parse?runs=` does, but waiting for a batch already reading demos rather than
/// refusing. Answers what was read; 404 when the run has no demo, 503 without the demo parser.
///
/// ## Example endpoint
/// - `/api/v1/admin/runs/367546/demo/parse`
///
/// ## Example response
/// ```json
/// { "picked": 1, "parsed": 1, "failed": 0, "missing_file": 0, "portals_set": 1, "segments_set": 1,
///   "partners_set": 0, "hosts_set": 0, "versions_named": 0, "remaining": 0 }
/// ```
#[post("/admin/runs/{id}/demo/parse")]
async fn admin_run_demo_parse(
    auth: AdminOrService,
    pool: web::Data<crate::tools::jobs::JobsPool>,
    config: web::Data<crate::tools::config::Config>,
    cache: web::Data<crate::tools::cache::CacheState>,
    id: web::Path<i64>,
) -> Result<impl Responder> {
    use crate::tools::demo_parse;
    if let AdminOrService::Admin(user) = &auth {
        if !user.is_role_admin() {
            return Ok(HttpResponse::Forbidden().body("Only admins can read demos again."));
        }
    }
    if !demo_parse::available(&config) {
        return Ok(HttpResponse::ServiceUnavailable().body("The demo parser isn't set up on this server."));
    }
    // The run's own demo and, for co-op, its partner's.
    let report = demo_parse::run_batch(&pool.0, &config, &cache, 2, Some(&[id.into_inner()])).await?;
    if report.picked == 0 {
        return Ok(HttpResponse::NotFound().body("This run has no demo."));
    }
    Ok(HttpResponse::Ok().json(report))
}

#[derive(serde::Deserialize)]
pub struct OldBoardsSyncQuery {
    /// Only report what would happen.
    #[serde(default)]
    pub dry_run: bool,
    /// Only this game's board (1 Portal 2, 2 Mel).
    pub game: Option<i32>,
    /// Start it and answer straight away (202).
    #[serde(default)]
    pub background: bool,
}

/// **POST** Pull from the old boards now, a full pull (admins; the schedule does this at
/// `SYNC.OLD_BOARDS_HOURS`, and quick pulls every `SYNC.OLD_BOARDS_MINUTES` when set). `?dry_run=true` only reports what would change; `?game=` limits it
/// to one board. Answers a report per board.
#[post("/admin/old_boards_sync")]
async fn admin_old_boards_sync(
    auth: AdminOrService,
    pool: web::Data<crate::tools::jobs::JobsPool>,
    config: web::Data<crate::tools::config::Config>,
    cache: web::Data<crate::tools::cache::CacheState>,
    query: web::Query<OldBoardsSyncQuery>,
) -> Result<impl Responder> {
    use crate::tools::{jobs, old_boards_sync};
    let by = match job_runner(&auth, jobs::OLD_BOARDS) {
        Ok(by) => by,
        Err(r) => return Ok(r),
    };
    if query.background {
        let (pool, config, cache, dry_run, game) = (pool.0.clone(), config.get_ref().clone(), cache.get_ref().clone(), query.dry_run, query.game);
        tokio::spawn(async move {
            let _ = jobs::track(jobs::OLD_BOARDS, &by, dry_run, old_boards_sync::summary, old_boards_sync::run_once(&pool, &config, &cache, dry_run, game, true)).await;
        });
        return Ok(started());
    }
    let reports = jobs::track(jobs::OLD_BOARDS, &by, query.dry_run, old_boards_sync::summary, old_boards_sync::run_once(&pool.0, &config, &cache, query.dry_run, query.game, true)).await?;
    Ok(HttpResponse::Ok().json(reports))
}
