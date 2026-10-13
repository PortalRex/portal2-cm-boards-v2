//! Per-run endpoints: co-op halves and reactions.
use crate::{
    controllers::runs,
    tools::{
        auth::{AdminOrService, MaybeUser, SignedIn},
        error::Result,
    },
};
use actix_web::{get, put, web, HttpResponse, Responder};
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
