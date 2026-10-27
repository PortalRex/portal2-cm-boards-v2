use crate::tools::auth::ServiceOnly;
use crate::{
    models::{
        points::{Points, PointsProfileWrapper, ProfilePage},
        users::{AvatarInsert, ProfileScore, Users},
    },
    tools::cache::CacheState,
    tools::points_cache::{PointsCache, Scope},
    tools::error::Result,
};
use crate::tools::ratelimit;
use actix_web::{get, post, put, web, HttpRequest, HttpResponse, Responder};
use std::time::Duration;
use sqlx::PgPool;
use std::collections::HashMap;

/// **GET** method for user information for a specific `profile_number`.
///
/// ## Example endpoints:
///  - **Default**
///     - `/api/v1/user/76561198040982247`
///
/// Makes a call to the underlying [Users::get_user]
///
/// ## Example JSON output
///
/// ```json
/// {
///     "profile_number": "76561198040982247",
///     "board_name": "Daniel",
///     "steam_name": "BigDaniel",
///     "banned": false,
///     "registered": 0,
///     "avatar": "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/92/921d9d7402a6e766759bcc0b2ac7b91f1dcf0ad2_full.jpg",
///     "twitch": "bigdaniel",
///     "youtube": "/channel/UCtwF46_PUGCefgRfrcIXOZA",
///     "title": null,
///     "admin": 1,
///     "donation_amount": null,
///     "discord_id": null
/// }
/// ```
#[get("/user/{profile_number}")]
async fn user(
    pool: web::Data<PgPool>,
    profile_number: web::Path<String>,
) -> Result<impl Responder> {
    Ok(web::Json(
        Users::get_user(pool.get_ref(), profile_number.into_inner()).await?,
    ))
}

/// **GET** method to get all `profile_number`s of all banned users on the board.
///
/// ## Example endpoints:
///  - **Default**
///     - `/api/v1/banned_users_all`
///
/// Makes a call to the underlying [Users::get_banned]
///
/// ## Example JSON output
///
/// ```json
/// [
///     "76561197960339145",
///     "76561197960403893",
///     "76561197961322276",
///     "76561197961957434",
///     "76561197962813887",
///     "76561197963045874",
///     "76561197965946552",...]
/// ```
#[get("/banned_users_all")]
async fn banned_users_all(pool: web::Data<PgPool>) -> Result<impl Responder> {
    Ok(web::Json(Users::get_banned(pool.get_ref()).await?))
}

/// **GET** method to return a bool based on if a user is banned or not.
///
/// ## Parameters
/// - `profile_number`
///     - **Required** - `String` - ID of the user you want to check.
///
/// ## Example endpoints:
///  - **With Parameters**
///     - `/api/v1/banned_user?profile_number=76561197960339145`
///
/// Makes a call to the underlying [Users::check_banned]
///
/// ## Example JSON output
///
/// ``` json
/// true
/// ```
#[derive(Deserialize)]
pub struct BannedQuery {
    pub profile_number: String,
}

#[get("/banned_user")]
async fn banned_user(query: web::Query<BannedQuery>, pool: web::Data<PgPool>) -> Result<impl Responder> {
    Ok(web::Json(Users::check_banned(pool.get_ref(), &query.profile_number).await?))
}

/// **POST** method to upload a new user to the boards.
///
/// Accepts field values for a new [Users]
///
/// ## Parameters (expects valid JSON Object):
///
/// - `profile_number`    
///     - **Required** - `String` : Steam ID for the user.
/// - `steam_name`    
///     - **Required** - `String` : User's name on Steam (not technically required, but treated as required).
/// - `banned`    
///     - **Required** - `bool` : If the user is banned on the boards.
/// - `registered`    
///     - **Required** - `i32` : If the user is registered (should typically be false).
/// - `admin`    
///     - **Required** - `i32` : The user's admin level (0 is default)
/// - `board_name`    
///     - **Optional** - `String` : Name specific to the portal 2 boards, allowed to be changed by user.
/// - `avatar`
///     - **Optional** - `String` : The profile image used for the user. Typically pulled from steam.
/// - `twitch`
///     - **Optional** - `String` : Twitch username (not full URL).
/// - `youtube`
///     - **Optional** - `String` : YouTube account. Format -> `/user/{user_id}`
/// - `title``
///     - **Optional** - `String` : Unique title to be displayed on the boards.
/// - `donation_amount`
///     - **Optional** - `String` : Total amount of money donated to the boards.
/// - `discord_id`
///     - **Optional** - `String` : Discord tag for the user's discord account.
///
/// ## Example endpoints:       
/// - `/api/v1/user`
///
/// ## Example JSON String
/// ```json
/// {
///     "profile_number": "76561198040982247",
///     "board_name": "Daniel",
///     "steam_name": "BigDaniel",
///     "banned": false,
///     "registered": 0,
///     "avatar": "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/92/921d9d7402a6e766759bcc0b2ac7b91f1dcf0ad2_full.jpg",
///     "twitch": "bigdaniel",
///     "youtube": "/channel/UCtwF46_PUGCefgRfrcIXOZA",
///     "title": "Developer",
///     "admin": 1,
///     "donation_amount": null,
///     "discord_id": BigDaniel#9055
/// }
/// ```
// TODO: Just return whole user, not boolean.
#[post("/user")]
async fn user_add(_auth: ServiceOnly, pool: web::Data<PgPool>, new_user: web::Json<Users>) -> Result<impl Responder> {
    Ok(web::Json(
        Users::insert_new_users(pool.get_ref(), new_user.0.clone()).await?,
    ))
}

/// **PUT** method to update the avatar for a user in the database.
///
/// ## Example endpoints:
///  - **Default**
///     - `/api/v1/user/avatar/76561198081168311`
///
/// Makes a call to the underlying [Users::update_avatar]
///
/// Should return the *previous* avatar for the user.
///
/// ## Example JSON string
///
/// ```json
/// {
///     "avatar": "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/39/3948dd3ae4d21772c845d4b3416bc7110b5aafb1_full.jpg"
/// }
/// ```
///
/// ## Example JSON output
///
/// ```json
/// "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/39/3948dd3ae4d21772c845d4b3416bc7110b5aafb1_full.jpg"
/// ```
#[put("/user/avatar/{profile_number}")]
async fn avatar_update(
    _auth: ServiceOnly,
    pool: web::Data<PgPool>,
    profile_number: web::Path<String>,
    data: web::Json<AvatarInsert>,
) -> Result<impl Responder> {
    let avatar = data.into_inner().avatar;
    let profile_number = profile_number.into_inner();
    Ok(web::Json(
        Users::update_avatar(pool.get_ref(), &profile_number, &avatar).await?,
    ))
}

/// **GET** method to return all user information for donators on the boards.
///
/// ## Example endpoints:
///  - **Default**
///     - `/api/v1/donators`
///
/// Makes a call to the underlying [Users::get_donators]
///
/// ## Example JSON output
///
/// ```json
/// [
///     {
///         "profile_number": "76561198029488151",
///         "board_name": null,
///         "steam_name": "BreweryJake",
///         "banned": false,
///         "registered": 0,
///         "avatar": "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/e0/e0b43f4bb265cdfc5e2486c67215b1082054e1a9_full.jpg",
///         "twitch": "breweryjake",
///         "youtube": "/user/HCMonstrLP",
///         "title": "Donator",
///         "admin": 0,
///         "donation_amount": "101",
///         "discord_id": null
///     },...]
/// ```
#[get("/donators")]
async fn donators(pool: web::Data<PgPool>) -> Result<impl Responder> {
    Ok(web::Json(Users::get_donators(pool.get_ref()).await?))
}

/// **GET** The board's staff: everyone with a staff role who isn't banned, admins first, then
/// moderators, then verifiers, each by name. Public (the About page lists the team).
///
/// ## Example endpoints:
///  - **Default**
///     - `/api/v1/staff`
///
/// Makes a call to the underlying [Users::get_staff]
///
/// ## Example JSON output
///
/// ```json
/// [
///     {
///         "profile_number": "76561198045074889",
///         "user_name": "Jonese1234",
///         "avatar": "https://avatars.steamstatic.com/9f6de098624a8f81ba6d2318e1923bdda1c710d6_full.jpg",
///         "role": "admin"
///     },
///     {
///         "profile_number": "76561198040982247",
///         "user_name": "Daniel",
///         "avatar": null,
///         "role": "verifier"
///     },...]
/// ```
#[get("/staff")]
async fn staff_list(pool: web::Data<PgPool>) -> Result<impl Responder> {
    Ok(web::Json(Users::get_staff(pool.get_ref()).await?))
}

/// **GET** method to return [UsersDisplay](crate::models::users::UsersDisplay) for all banned users on the boards.
///
/// ## Example endpoints:
///  - **Default**
///     - `/api/v1/wall_of_shame`
///
/// Makes a call to the underlying [Users::get_banned_display]
///
/// ## Example JSON output
///
/// ```json
/// [
///     {
///         "profile_number": "76561197960339145",
///         "user_name": "louis vuitton",
///         "avatar": "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/f6/f6963c618e35e95ca84c631fcf7d6bf8dec72485_full.jpg"
///     },...]
/// ```
#[get("/wall_of_shame")]
async fn wall_of_shame(pool: web::Data<PgPool>) -> Result<impl Responder> {
    Ok(web::Json(Users::get_banned_display(pool.get_ref()).await?))
}

/// **GET** method for most of a given user's profile information.
///
/// The user's changelog history can be grabbed from specifying filters to the
/// [Changelog](crate::api::v1::handlers::changelog::changelog) endpoint. This endpoint does
/// include information on the current ranks for all maps on the default category IDs per-map.
///
/// ## Example endpoints:
///  - **Default**
///     - `/api/v1/profile/76561198040982247`
///
/// Makes a call to the underlying [Users::get_profile], then utilizes the [cache](crate::tools::cache::CacheState)
/// to get rank information per-map.
///
/// ## Example JSON output
///
/// ```json
/// {
///     "points": [
///         {
///             "id": 1,
///             "points": {
///                 "points": 961.515,
///                 "score": 8653,
///                 "num_scores": 6,
///                 "total_rank_sum": 133,
///                 "worst": [
///                     36,
///                     "45467"
///                 ],
///                 "best": [
///                     12,
///                     "47828"
///                 ],
///                 "user_name": "Daniel",
///                 "avatar": "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/92/921d9d7402a6e766759bcc0b2ac7b91f1dcf0ad2_full.jpg"
///             }
///         },
///         ...],
///        "data": {
///            "oldest": {
///                "map": "52759",
///                "map_name": "Gel Maze",
///                "score": 2768,
///                "timestamp": "2019-04-18T20:51:22"
///            },
///            "newest": {
///                "map": "47755",
///                "map_name": "Bridge the Gap",
///                "score": 1628,
///                "timestamp": "2021-08-22T18:36:59"
///            }
///        },
///        "ranks": {
///            "47798": 24,
///            "47806": 19,
///         ...
///        }
///    }
/// ```
#[get("/profile/{profile_number}")]
async fn profile(
    pool: web::Data<PgPool>,
    profile_number: web::Path<String>,
    cache: web::Data<CacheState>,
    points_cache: web::Data<PointsCache>,
) -> Result<impl Responder> {
    // TODO : Scores on drop down are queried individually by the frontend
    let profile_number = profile_number.into_inner();
    let data = Users::get_profile(pool.get_ref(), &profile_number).await?;
    let (_, ranks) = profile_from_cache(cache, &profile_number).await?;
    // Points and placements from the server's points cache (the same boards the leaderboards show).
    let points = profile_points(pool.get_ref(), &points_cache, &profile_number).await?;
    let profile_page = ProfilePage {
        points,
        ranks,
        data,
    };
    Ok(web::Json(profile_page))
}

/// **GET** a player's Portal 2 personal bests with their rank and deltas to the
/// world record and to the next better time, from the rank cache.
///
/// ## Example endpoints:
///  - `/api/v1/profile/scores/76561198040982247`
#[derive(Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct FoundUser {
    pub profile_number: String,
    pub user_name: String,
    pub avatar: Option<String>,
    pub runs: i64,
}

/// **GET** Players matching a name or Steam ID (up to 10, most active first), for pickers.
#[get("/users/search")]
async fn users_search(req: HttpRequest, config: web::Data<crate::tools::config::Config>, pool: web::Data<PgPool>, query: web::Query<SearchQuery>) -> Result<impl Responder> {
    if let Err(limited) = ratelimit::check(&req, &config, "search", 60, Duration::from_secs(60)) {
        return Ok(limited);
    }
    let q = query.q.trim();
    if q.chars().count() < 2 {
        return Ok(HttpResponse::Ok().json(Vec::<FoundUser>::new()));
    }
    // LIKE wildcards in the name are matched literally.
    let like = format!("%{}%", q.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"));
    // Name matches come from the trigram index (migration 20261027000000); run counts are only
    // worked out for the candidates, not every match.
    let found = sqlx::query_as::<_, FoundUser>(
        r#"
            SELECT c.profile_number, c.user_name, c.avatar,
                (SELECT COUNT(*) FROM changelog AS cl WHERE cl.profile_number = c.profile_number AND NOT cl.banned) AS runs
            FROM (
                SELECT u.profile_number, COALESCE(u.board_name, u.steam_name, u.profile_number) AS user_name, u.avatar
                FROM users AS u
                WHERE u.profile_number <> 'N/A' AND NOT u.banned
                  AND (u.profile_number = $1 OR COALESCE(u.board_name, u.steam_name) ILIKE $2)
                ORDER BY (u.profile_number = $1) DESC, (COALESCE(u.board_name, u.steam_name) ILIKE $3) DESC
                LIMIT 300
            ) AS c
            ORDER BY (c.profile_number = $1) DESC, runs DESC
            LIMIT 10
        "#,
    )
    .bind(q)
    .bind(&like)
    // Names starting with the query rank first among the candidates.
    .bind(like.trim_start_matches('%'))
    .fetch_all(pool.get_ref())
    .await?;
    Ok(HttpResponse::Ok().json(found))
}

/// **GET** A player's points over time in a game (default Portal 2), ranks recomputed against
/// everyone's best times at each date: `[{ "date": "2024-01-07", "sp": 1234.5, "coop": 980.0, "overall": 2214.5 }, ...]`.
#[get("/profile/points_history/{profile_number}")]
async fn profile_points_history(req: HttpRequest, config: web::Data<crate::tools::config::Config>, pool: web::Data<PgPool>, profile_number: web::Path<String>, query: web::Query<StatsQuery>) -> Result<impl Responder> {
    if let Err(limited) = ratelimit::check(&req, &config, "points", 60, Duration::from_secs(60)) {
        return Ok(limited);
    }
    Ok(HttpResponse::Ok().json(crate::tools::points_history::points_history(pool.get_ref(), query.game_id.unwrap_or(1), &profile_number).await?))
}

/// **GET** A player's peak points per board in a game (default Portal 2), each with the date it
/// was reached: `{ "sp": { "points": 10450.2, "date": "2024-05-01" }, "coop": ..., "overall": ... }`.
#[derive(serde::Deserialize)]
pub struct ProfileAtQuery {
    /// The day (YYYY-MM-DD, as of its end in UTC) or moment (ISO, UTC) to look back at.
    pub at: String,
    pub game_id: Option<i32>,
}

/// **GET** Where a player stood at a past moment: points and global place per board, and their
/// best time, rank and points on each map then (ranks against everyone's times as of then).
/// `?at=2021-04-06` or `?at=2021-04-06T12:00:00`.
#[get("/profile/at/{profile_number}")]
async fn profile_at(req: HttpRequest, config: web::Data<crate::tools::config::Config>, pool: web::Data<PgPool>, profile_number: web::Path<String>, query: web::Query<ProfileAtQuery>) -> Result<impl Responder> {
    if let Err(limited) = crate::tools::ratelimit::check(&req, &config, "points", 60, std::time::Duration::from_secs(60)) {
        return Ok(limited);
    }
    let Some(at) = crate::tools::helpers::parse_moment(&query.at) else {
        return Ok(HttpResponse::BadRequest().body("Give the date as YYYY-MM-DD."));
    };
    match crate::tools::points_history::profile_at(pool.get_ref(), query.game_id.unwrap_or(1), &profile_number, at).await? {
        Some(standing) => Ok(HttpResponse::Ok().json(standing)),
        None => Ok(HttpResponse::NotFound().body("No runs for this player.")),
    }
}

#[derive(serde::Deserialize)]
pub struct AggregatedQuery {
    /// Look back to this day (YYYY-MM-DD, as of its end in UTC) or moment; now when left out.
    pub at: Option<String>,
    pub game_id: Option<i32>,
}

/// **GET** A player's place on every aggregated board (each chapter, each mode, overall), now or
/// as of `?at=`: points (rank, points, gap to the next player up and to first) and time (the same,
/// on boards where they have a time on every map), like the old boards' "aggregated times and
/// points". `/profile/aggregated/76561198039230536?game_id=1&at=2021-04-06`
///
/// ```json
/// [{ "board": "chapter-7", "points": { "rank": 14, "value": 1443.2, "next": -26.1, "wr": -310.4 },
///    "time": { "rank": 21, "value": 66693, "next": 95, "wr": 1373 } }, ...]
/// ```
#[get("/profile/aggregated/{profile_number}")]
async fn profile_aggregated(req: HttpRequest, config: web::Data<crate::tools::config::Config>, pool: web::Data<PgPool>, profile_number: web::Path<String>, query: web::Query<AggregatedQuery>) -> Result<impl Responder> {
    if let Err(limited) = ratelimit::check(&req, &config, "points", 60, Duration::from_secs(60)) {
        return Ok(limited);
    }
    let at = match query.at.as_deref() {
        Some(day) => match crate::tools::helpers::parse_moment(day) {
            Some(at) => Some(at),
            None => return Ok(HttpResponse::BadRequest().body("Give the date as YYYY-MM-DD.")),
        },
        None => None,
    };
    match crate::tools::points_history::aggregates(pool.get_ref(), query.game_id.unwrap_or(1), &profile_number, at).await? {
        Some(rows) => Ok(HttpResponse::Ok().json(rows)),
        None => Ok(HttpResponse::NotFound().body("No runs for this player.")),
    }
}

#[get("/profile/points_peak/{profile_number}")]
async fn profile_points_peak(
    req: HttpRequest,
    config: web::Data<crate::tools::config::Config>,
    pool: web::Data<PgPool>,
    points_cache: web::Data<PointsCache>,
    profile_number: web::Path<String>,
    query: web::Query<StatsQuery>,
) -> Result<impl Responder> {
    if let Err(limited) = ratelimit::check(&req, &config, "points", 60, Duration::from_secs(60)) {
        return Ok(limited);
    }
    let game_id = query.game_id.unwrap_or(1);
    let mut peaks = (*crate::tools::points_history::points_peak(pool.get_ref(), game_id, &profile_number).await?).clone();
    // The peak comes from replaying the run history, the points now (on the profile beside it) from
    // the points cache. Where the two disagree (a co-op run whose halves are paired into different
    // bundles counts twice in the history), the peak is still never below the points now.
    if game_id == 1 {
        let today = chrono::Utc::now().date_naive();
        for w in profile_points(pool.get_ref(), &points_cache, &profile_number).await? {
            let key = match w.id {
                -1 => "sp",
                -2 => "coop",
                _ => "overall",
            };
            let now = (w.points.points as f64 * 10.0).round() / 10.0;
            if now > 0.0 && peaks.get(key).is_none_or(|p| now > p.points) {
                peaks.insert(key.to_string(), crate::tools::points_history::Peak { points: now, date: today });
            }
        }
    }
    Ok(HttpResponse::Ok().json(peaks))
}

#[derive(Deserialize)]
pub struct StatsQuery {
    pub game_id: Option<i32>,
}

/// **GET** A player's stats in a game (default Portal 2): activity, co-op partners (maps and
/// runs together) and portal counts from demos.
#[get("/profile/stats/{profile_number}")]
async fn profile_stats(pool: web::Data<PgPool>, profile_number: web::Path<String>, query: web::Query<StatsQuery>) -> Result<impl Responder> {
    Ok(web::Json(crate::controllers::profile_stats::profile_stats(pool.get_ref(), &profile_number, query.game_id.unwrap_or(1)).await?))
}

/// **GET** A player's personal best on each map of a game (default Portal 2), with the partner on
/// co-op maps (also runs where their half is the placeholder and the bundle names them).
///
/// ## Parameters:
/// - `game_id`
///     - **Optional** - `i32` : The game or season. Portal 2's bests come with their rank and the
///       gaps to the next time and the WR; other games' leave those out (`/ranks/game` has ranks).
///
/// ## Example endpoints:
///  - `/api/v1/profile/scores/76561198039230536`
///  - `/api/v1/profile/scores/76561199006050430?game_id=4`
///
/// ## Example JSON output
/// ```json
/// [{ "map_id": "52757", "score": 1475, "timestamp": "2024-06-15T14:21:21", "changelog_id": 290743,
///    "is_multiplayer": true, "partner_profile_number": "76561198302681368", "partner_name": "Chevalix",
///    "partner_avatar": "https://avatars.steamstatic.com/...jpg", "rank": 72, "delta_to_wr": 365, "delta_to_next": 2 }, ...]
/// ```
#[get("/profile/scores/{profile_number}")]
async fn profile_scores(
    pool: web::Data<PgPool>,
    profile_number: web::Path<String>,
    query: web::Query<StatsQuery>,
    cache: web::Data<CacheState>,
) -> Result<impl Responder> {
    let profile_number = profile_number.into_inner();
    let game_id = query.game_id.unwrap_or(1);
    let mut scores = ProfileScore::get_profile_scores(pool.get_ref(), &profile_number, game_id).await?;
    // The ranks cache is Portal 2's.
    if game_id != 1 {
        return Ok(web::Json(scores));
    }
    let r = &*cache.ranks.lock().await;
    let ranks = r.current_ranks.get(&profile_number);
    for pb in scores.iter_mut() {
        pb.rank = ranks.and_then(|m| m.get(&pb.map_id)).copied();
        if let Some(board) = r.map_scores.get(&pb.map_id).filter(|b| !b.is_empty()) {
            pb.delta_to_wr = Some(pb.score - board[0]);
            // Distinct scores are ascending; the next better time is the last one below ours.
            let better = board.partition_point(|&s| s < pb.score);
            pb.delta_to_next = better.checked_sub(1).map(|i| pb.score - board[i]);
        }
    }
    Ok(web::Json(scores))
}

/// A player's sp (-1), coop (-2) and overall (-3) points with placements, from the points cache.
pub(crate) async fn profile_points(pool: &PgPool, cache: &PointsCache, profile_number: &str) -> anyhow::Result<Vec<PointsProfileWrapper>> {
    let mut out = Vec::new();
    for (id, key, scope) in [(-1, "sp", Scope::Modes(&["sp"])), (-2, "coop", Scope::Modes(&["coop"])), (-3, "overall", Scope::All)] {
        let board = cache.board(pool, 1, key, scope).await?;
        let board_map: HashMap<String, Points> = board.points.iter().cloned().collect();
        if let Some(x) = board_map.get(profile_number) {
            let (place, score_place) = placement(&board_map, x);
            let country_place = x.country_id.map(|c| board_map.values().filter(|p| p.country_id == Some(c) && p.points > x.points).count() as i32 + 1);
            out.push(PointsProfileWrapper { id, points: x.clone(), place, score_place, country_place });
        }
    }
    Ok(out)
}

/// Placement of `player` on a points board: by points, and by total time among
/// players with the same number of scores (time totals are only comparable then).
fn placement(board: &HashMap<String, Points>, player: &Points) -> (i32, i32) {
    let place = board.values().filter(|p| p.points > player.points).count() as i32 + 1;
    let score_place = board
        .values()
        .filter(|p| p.num_scores == player.num_scores && p.score < player.score)
        .count() as i32
        + 1;
    (place, score_place)
}

/// Pulls & clones the data from the ranks cache to be used for the profile endpoint.
pub async fn profile_from_cache(
    cache: web::Data<CacheState>,
    profile_number: &String,
) -> anyhow::Result<(Vec<PointsProfileWrapper>, HashMap<String, i32>)> {
    let mut points: Vec<PointsProfileWrapper> = Vec::new();
    let points_hm = cache.points.lock().await;
    for i in 1..16 {
        if let Some(points_cache) = points_hm.get(&*format!("points{}", i)) {
            if let Some(x) = points_cache.get(profile_number) {
                let (place, score_place) = placement(points_cache, x);
                points.push(PointsProfileWrapper {
                    id: i,
                    points: x.clone(),
                    place,
                    score_place,
                    country_place: None,
                });
            }
        }
    }
    if let Some(points_cache) = points_hm.get("points_sp") {
        if let Some(x) = points_cache.get(profile_number) {
            let (place, score_place) = placement(points_cache, x);
            points.push(PointsProfileWrapper {
                id: -1,
                points: x.clone(),
                place,
                score_place,
                country_place: None,
            });
        }
    }
    if let Some(points_cache) = points_hm.get("points_coop") {
        if let Some(x) = points_cache.get(profile_number) {
            let (place, score_place) = placement(points_cache, x);
            points.push(PointsProfileWrapper {
                id: -2,
                points: x.clone(),
                place,
                score_place,
                country_place: None,
            });
        }
    }
    if let Some(points_cache) = points_hm.get("points_overall") {
        if let Some(x) = points_cache.get(profile_number) {
            let (place, score_place) = placement(points_cache, x);
            points.push(PointsProfileWrapper {
                id: -3,
                points: x.clone(),
                place,
                score_place,
                country_place: None,
            });
        }
    }
    let r = &*cache.ranks.lock().await;
    // Players with no ranked runs have no entry in the rank cache.
    let ranks = r.current_ranks.get(profile_number).cloned().unwrap_or_default();
    Ok((points, ranks))
}
