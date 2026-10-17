use crate::{models::changelog::*, models::stats::*, tools::error::Result};
use actix_web::{get, web, Responder};
use sqlx::PgPool;

/// **GET** method to query for the number of scores per-user across all maps.
///
/// Returns an ordered list of valid, non-banned users with the number of valid scores that they have on the boards.
///
/// ## Example endpoint:
///  - **Default**           
///     - `/api/v1/stats/count_scores`
///
/// Makes a call to the underlying [NumScores::most_cl_enries_overall]
///
/// ## Example JSON output
///
/// ```json
/// [
///     {
///         "count": 1925,
///         "profile_number": "76561198039230536",
///         "user_name": "Zypeh",
///         "avatar": "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/dc/dc4c1cfa8f0c5b0c85354825c7711f60c3714a41_full.jpg"
///     },
///     {
///         "count": 1809,
///         "profile_number": "76561198068358920",
///         "user_name": "Kendal",
///         "avatar": "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/b8/b8800fc58ceede98b32949b802aed05c8c2d9ece_full.jpg"
///     },...]
/// ```
#[get("/stats/count_scores")]
pub async fn count_scores(pool: web::Data<PgPool>) -> Result<impl Responder> {
    Ok(web::Json(
        NumScores::most_cl_enries_overall(pool.get_ref()).await?,
    ))
}

/// **GET** method to query for number of scores per-user on a specific map.
///
/// Returns an ordered list of valid, non-banned users with the number of valid scores
/// that they have on the given map_id.
///
/// ## Example endpoint:
///  - **Default**           
///     - `/api/v1/stats/count_scores/47763`
///
/// Makes a call to the underlying [NumScores::most_cl_entries_by_map]
///
/// ## Example JSON output
///
/// ```json
/// [
///     {
///         "count": 19,
///         "profile_number": "76561198124459214",
///         "user_name": "Dzhessi",
///         "avatar": "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/0a/0ae75ea43933cc981e65b6562188544fc42ceba1_full.jpg"
///     },
///     {
///         "count": 17,
///         "profile_number": "76561198048179892",
///         "user_name": "Betsruner",
///         "avatar": "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/e7/e7a266be79a99e3bd758c4ae8f1d386309b57a9a_full.jpg"
///     },...]
/// ```
#[get("/stats/count_scores/{map_id}")]
pub async fn count_scores_by_map(
    pool: web::Data<PgPool>,
    map_id: web::Path<String>,
) -> Result<impl Responder> {
    Ok(web::Json(
        NumScores::most_cl_entries_by_map(pool.get_ref(), &map_id).await?,
    ))
}

#[derive(Deserialize, Clone, Debug)]
pub struct LimitQuery {
    pub limit: Option<i32>,
}

/// **GET** method to generate an activity recap for the boards.
///
/// Recap based on the format created by NeKz for the p2sr Discord.
///
/// ## Example endpoint:
///  - **Default**
///     - `/api/v1/stats/recap`
/// - **Specified Limit**
///     - `/api/v1/stats/recap?limit=3`
///
/// Makes a call to the underlying [Recap::collect_recap]
///
/// ## Example JSON output:
///
/// ```json
/// {
///     "num_wrs": [
///         {
///             "profile_number": "76561198795823814",
///             "user_name": "Royal",
///             "avatar": "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/d8/d84366b1be1f0439b0edc7fc8404fe2ea29a9c54_full.jpg",
///             "count": 2
///         }
///     ],
///     "num_demos": [
///         {
///             "profile_number": "76561198902321340",
///             "user_name": "Leve",
///             "avatar": "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/7a/7a56621890546d1a54d4b583198b4d30411950b2_full.jpg",
///             "count": 47
///         }
///     ],
///     "top_wr_diff": [
///         {
///             "profile_number": "76561198081168311",
///             "user_name": "unity",
///             "avatar": "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/39/3948dd3ae4d21772c845d4b3416bc7110b5aafb1_full.jpg",
///             "score_delta": -1138,
///             "map_id": "47845",
///             "map_name": "Industrial Fan"
///         }
///     ],
///     "most_updates": [
///         {
///             "profile_number": "76561198902321340",
///             "user_name": "Leve",
///             "avatar": "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/7a/7a56621890546d1a54d4b583198b4d30411950b2_full.jpg",
///             "count": 47
///         }
///     ],
///     "top_videos": [
///         {
///             "profile_number": "76561198384377251",
///             "user_name": "Schwi",
///             "avatar": "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/1b/1bb40c9b85773e89a2074fdf57ab8ab9dea1e744_full.jpg",
///             "count": 1
///         }
///     ],
///     "top_score_by_map": [
///         {
///             "map_id": "47458",
///             "map_name": "Portal Gun",
///             "count": 23
///         }
///     ]
/// }
/// ```
#[get("/stats/recap")]
pub async fn recap(
    pool: web::Data<PgPool>,
    query: web::Query<LimitQuery>,
) -> Result<impl Responder> {
    Ok(web::Json(
        Recap::collect_recap(pool.get_ref(), query.into_inner().limit).await?,
    ))
}

#[get("/stats/badges")]
pub async fn badges(pool: web::Data<PgPool>) -> Result<impl Responder> {
    Ok(web::Json(Badges::get_bages(pool.get_ref()).await?))
}

#[get("/stats/badges/{profile_number}")]
pub async fn users_badges(
    pool: web::Data<PgPool>,
    profile_number: web::Path<String>,
) -> Result<impl Responder> {
    Ok(web::Json(
        BadgeEntries::get_badge_by_user(pool.get_ref(), &profile_number).await?,
    ))
}

#[derive(Deserialize)]
pub struct SiteStatsQuery {
    pub game_id: Option<i32>,
}

/// **GET** Site-wide runner statistics for a game (default Portal 2), for the Stats page:
/// `totals`, `leaders` (per list: `wr_held`, `wr_set`, `runs`, `runs_year`, `demos`, `portals`,
/// `time_saved`, `partners`), `longest_wrs` and `peaks` (per board key, highest peak points
/// first, each with the date reached and the player's points now).
///
/// - `/api/v1/stats/site`
/// - `/api/v1/stats/site?game_id=2`
#[get("/stats/site")]
async fn site_stats(
    req: actix_web::HttpRequest,
    config: web::Data<crate::tools::config::Config>,
    pool: web::Data<PgPool>,
    points_cache: web::Data<crate::tools::points_cache::PointsCache>,
    query: web::Query<SiteStatsQuery>,
) -> Result<impl Responder> {
    if let Err(limited) = crate::tools::ratelimit::check(&req, &config, "stats", 30, std::time::Duration::from_secs(60)) {
        return Ok(limited);
    }
    let game_id = query.game_id.unwrap_or(1);
    let stats = crate::controllers::site_stats::for_game(pool.get_ref(), &points_cache, game_id).await?;
    Ok(actix_web::HttpResponse::Ok().json(&*stats))
}

/// **GET** World record statistics for a game (default Portal 2): every map's current record
/// (`records`, `total_time`), `holders` (maps held now, days holding records, record runs set),
/// `longest` (longest-lasting records), `domination` (one player holding a map through several
/// record times), `improvements`, the `race` (records held per player at the start of each month,
/// per board and overall, with `race_players`), and `endings` (verified runs per hundredths
/// ending). Staff (and the service token) also get `flagged`: runs whose time doesn't match their
/// demo, and the runs ending in 2 or 7 with what their demo says (timer rounding, or no demo).
///
/// - `/api/v1/stats/wr`
#[get("/stats/wr")]
async fn wr_stats(
    req: actix_web::HttpRequest,
    config: web::Data<crate::tools::config::Config>,
    pool: web::Data<PgPool>,
    user: crate::tools::auth::MaybeUser,
    query: web::Query<SiteStatsQuery>,
) -> Result<impl Responder> {
    if let Err(limited) = crate::tools::ratelimit::check(&req, &config, "stats", 30, std::time::Duration::from_secs(60)) {
        return Ok(limited);
    }
    let stats = crate::controllers::wr_stats::wr_stats(pool.get_ref(), query.game_id.unwrap_or(1)).await?;
    let staff = crate::tools::auth::service_token_ok(&req, &config) || user.0.as_ref().is_some_and(|u| u.is_admin());
    if staff {
        return Ok(actix_web::HttpResponse::Ok().json(&*stats));
    }
    let mut public = (*stats).clone();
    public.flagged = Default::default();
    Ok(actix_web::HttpResponse::Ok().json(public))
}
