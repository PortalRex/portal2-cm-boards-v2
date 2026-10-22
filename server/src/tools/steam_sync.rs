//! Pulls new Portal 2 times from Steam. Challenge mode uploads every player's best time per map
//! to Steam's leaderboards (each map's `steam_id` is its leaderboard), and this job reads them
//! back: every `SYNC.MINUTES` it fetches the top of each map's leaderboard and records any time
//! that beats what the board has for that player, the way the old boards' fetcher did.
//!
//! The first pass over a map only records what Steam shows (the baseline) and adds nothing:
//! Steam's leaderboards carry no dates, and the old board leaves some Steam times out on purpose,
//! so a time the board doesn't have by then is never pulled in. After that, only entries that
//! changed on Steam since the previous pass are considered, and a new run is dated when it's seen.
//! A run staff remove later stays removed unless the player improves again. State is kept in
//! `steam_sync_maps` and `steam_sync_entries`.
//!
//! Rules, per Steam entry:
//! - Only entries ranked within the top `SYNC.RANK_LIMIT` (500) of the leaderboard's valid
//!   entries are considered (tied scores share a rank; hacked and banned entries don't count).
//! - Banned and frozen players are skipped, as is a time the player already has on the map (so a
//!   banned time isn't pulled again) and anything that isn't an improvement on their best.
//! - Unknown players get an account from the Steam Web API.
//! - Times are recorded like site submissions ([crate::controllers::submissions::insert_run]):
//!   pending when they'd rank in the top 200 without a demo, and co-op times are paired when two
//!   new entries share a score, else bundled with the map's placeholder partner.
//!
//! Portal Stories: Mel has no public Steam leaderboards, so its times only come from submissions.
use crate::{
    controllers::{
        moderation::{self, FILLER},
        submissions::{self, BoardMap, NewRun},
    },
    models::users::{GetPlayerSummariesWrapper, Users},
    tools::{cache::CacheState, config::Config, points_cache},
};
use sqlx::PgPool;
use std::{
    collections::{hash_map::DefaultHasher, HashMap, HashSet},
    hash::{Hash, Hasher},
    time::Duration,
};

/// Game whose maps have Steam leaderboards.
const PORTAL2_GAME_ID: i32 = 1;
/// How far down each leaderboard to read, as a multiple of the rank limit: hacked and banned
/// entries take up places, and co-op boards list both players, so more entries per rank.
const DEPTH_SP: i32 = 2;
const DEPTH_COOP: i32 = 3;
/// Pause between maps so a cycle isn't a burst of requests at Steam.
const BETWEEN_MAPS: Duration = Duration::from_millis(250);

/// What one cycle did.
#[derive(Debug, Default, Serialize, Clone)]
pub struct SyncReport {
    pub maps_checked: usize,
    pub maps_unchanged: usize,
    pub maps_failed: usize,
    pub runs_added: usize,
    /// Maps passed for the first time (their entries recorded as the baseline, nothing added).
    pub maps_baselined: usize,
    pub runs_pending: usize,
    pub players_created: usize,
    /// Players added without a Steam name and picture (see [fill_missing_profiles]) that got them.
    pub profiles_filled: usize,
}

/// One cycle at a time (the schedule and the staff endpoint share it).
static RUNNING: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Starts the schedule (no-op when `SYNC.STEAM` is off).
pub fn start(pool: PgPool, config: Config, cache: CacheState) {
    if !config.sync.steam() {
        log::info!("steam sync: off (SYNC.STEAM)");
        return;
    }
    if !has_api_key(&config) {
        log::warn!("steam sync: STEAM.API_KEY is empty, so new players get no name or picture until it's set");
    }
    let every = Duration::from_secs(config.sync.minutes() * 60);
    tokio::spawn(async move {
        // Let the caches warm first.
        tokio::time::sleep(Duration::from_secs(30)).await;
        loop {
            match crate::tools::jobs::track(crate::tools::jobs::STEAM_SYNC, "schedule", false, summary, run_once(&pool, &config, &cache, None)).await {
                Ok(r) => log::info!(
                    "steam sync: {} maps checked ({} baselined, {} unchanged, {} failed), {} runs added ({} pending), {} players created, {} names filled in",
                    r.maps_checked, r.maps_baselined, r.maps_unchanged, r.maps_failed, r.runs_added, r.runs_pending, r.players_created, r.profiles_filled
                ),
                Err(e) => log::error!("steam sync failed: {e}"),
            }
            tokio::time::sleep(every).await;
        }
    });
}

/// What a pass did, in one line (admin page).
pub fn summary(r: &SyncReport) -> String {
    format!(
        "{} maps checked ({} unchanged, {} failed), {} runs added ({} pending), {} players created, {} names filled in",
        r.maps_checked, r.maps_unchanged, r.maps_failed, r.runs_added, r.runs_pending, r.players_created, r.profiles_filled
    )
}

/// Whether a Steam Web API key is set (player names and pictures come from it).
fn has_api_key(config: &Config) -> bool {
    !matches!(config.steam.api_key.trim(), "" | "unused")
}

/// Players added while their Steam profile couldn't be read (no API key, Steam down) have no name
/// or picture. Each pass fills in up to 100 of them with one Steam call (random ones, so accounts
/// Steam no longer has don't hold up the rest). Returns how many got one.
async fn fill_missing_profiles(pool: &PgPool, config: &Config, client: &reqwest::Client) -> Result<usize, sqlx::Error> {
    if !has_api_key(config) {
        return Ok(0);
    }
    let ids: Vec<String> = sqlx::query_scalar(
        "SELECT profile_number FROM users WHERE steam_name IS NULL AND board_name IS NULL AND profile_number ~ '^7656119[0-9]{10}$' ORDER BY random() LIMIT 100",
    )
    .fetch_all(pool)
    .await?;
    if ids.is_empty() {
        return Ok(0);
    }
    let url = format!("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key={}&steamids={}", config.steam.api_key.trim(), ids.join(","));
    // Errors without the URL: it holds the API key.
    let players = match client.get(&url).send().await.and_then(reqwest::Response::error_for_status) {
        Ok(res) => match res.json::<GetPlayerSummariesWrapper>().await {
            Ok(w) => w.response.players,
            Err(e) => {
                log::warn!("steam sync: player profiles: {}", e.without_url());
                return Ok(0);
            }
        },
        Err(e) => {
            log::warn!("steam sync: player profiles: {}", e.without_url());
            return Ok(0);
        }
    };
    let mut filled = 0;
    for p in players.iter().filter(|p| ids.contains(&p.steamid)) {
        filled += sqlx::query("UPDATE users SET steam_name = $2, avatar = COALESCE(avatar, NULLIF($3, '')) WHERE profile_number = $1 AND steam_name IS NULL AND board_name IS NULL")
            .bind(&p.steamid)
            .bind(&p.personaname)
            .bind(&p.avatarfull)
            .execute(pool)
            .await?
            .rows_affected() as usize;
        Users::set_default_country(pool, &p.steamid, p.loccountrycode.as_deref()).await?;
    }
    Ok(filled)
}

/// One pass over every public Portal 2 map (the hidden ones have no Steam leaderboard), or just
/// `only`, a map's steam id, to try it on one map.
/// `Err` only for failures that stop the whole pass (the database); a map whose leaderboard
/// can't be read is counted in `maps_failed`.
pub async fn run_once(pool: &PgPool, config: &Config, cache: &CacheState, only: Option<&str>) -> Result<SyncReport, sqlx::Error> {
    let _guard = RUNNING.lock().await;
    let mut report = SyncReport::default();
    let maps = sqlx::query_as::<_, BoardMap>(
        r#"
            SELECT m.steam_id, m.name, c.game_id, c.game_mode, c.is_multiplayer AS is_coop, m.default_cat_id
            FROM maps AS m JOIN chapters AS c ON c.id = m.chapter_id
            WHERE c.game_id = $1 AND m.is_public AND m.default_cat_id IS NOT NULL AND ($2::text IS NULL OR m.steam_id = $2)
            ORDER BY m.id
        "#,
    )
    .bind(PORTAL2_GAME_ID)
    .bind(only)
    .fetch_all(pool)
    .await?;
    let banned: HashSet<String> = Users::get_banned(pool).await?.into_iter().collect();
    let client = reqwest::Client::builder().timeout(Duration::from_secs(30)).user_agent("p2cm-boards sync").build().ok();
    let Some(client) = client else {
        return Ok(report);
    };
    let mut any_added = false;
    for map in &maps {
        report.maps_checked += 1;
        let last_hash: Option<Option<i64>> = sqlx::query_scalar("SELECT last_hash FROM steam_sync_maps WHERE map_id = $1")
            .bind(&map.steam_id)
            .fetch_optional(pool)
            .await?;
        let baseline = last_hash.is_none();
        let depth = config.sync.rank_limit() * if map.is_coop { DEPTH_COOP } else { DEPTH_SP };
        let body = match fetch_leaderboard(&client, &map.steam_id, depth).await {
            Ok(b) => b,
            Err(e) => {
                log::warn!("steam sync: {} ({}): {e}", map.name, map.steam_id);
                report.maps_failed += 1;
                continue;
            }
        };
        let digest = hash_of(&body);
        if !baseline && last_hash.flatten() == Some(digest) {
            report.maps_unchanged += 1;
            continue;
        }
        let entries = parse_entries(&body);
        let previous: HashMap<String, i32> = if baseline {
            HashMap::new()
        } else {
            sqlx::query_as::<_, (String, i32)>("SELECT profile_number, score FROM steam_sync_entries WHERE map_id = $1")
                .bind(&map.steam_id)
                .fetch_all(pool)
                .await?
                .into_iter()
                .collect()
        };
        let result = if baseline {
            report.maps_baselined += 1;
            Ok(0)
        } else {
            sync_map(pool, config, map, &entries, &previous, &banned, &mut report).await
        };
        match result {
            Ok(added) => {
                save_snapshot(pool, &map.steam_id, &entries, digest).await?;
                if added > 0 {
                    any_added = true;
                    if cache.default_cat_ids.contains_key(&map.steam_id) {
                        cache.reload_rank(pool, &map.steam_id, config, map.is_coop).await;
                    }
                }
            }
            Err(e) => {
                // Not recorded as seen, so the map is retried next pass.
                log::error!("steam sync: {} ({}): {e}", map.name, map.steam_id);
                report.maps_failed += 1;
            }
        }
        tokio::time::sleep(BETWEEN_MAPS).await;
    }
    report.profiles_filled = fill_missing_profiles(pool, config, &client).await?;
    // Names and pictures show in the cached previews and points too.
    if any_added || report.profiles_filled > 0 {
        cache.update_current_states(&[crate::tools::cache::SP_PREVIEWS, crate::tools::cache::COOP_PREVIEWS], &[false, false]).await;
        points_cache::invalidate_points().await;
    }
    Ok(report)
}

async fn fetch_leaderboard(client: &reqwest::Client, map_id: &str, depth: i32) -> Result<String, String> {
    let url = format!("https://steamcommunity.com/stats/Portal2/leaderboards/{map_id}?xml=1&start=1&end={depth}");
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    let body = res.text().await.map_err(|e| e.to_string())?;
    if let Some(err) = between(&body, "<error>", "</error>") {
        return Err(err.replace("<![CDATA[", "").replace("]]>", ""));
    }
    if !body.contains("<entries>") {
        return Err("no entries in the response".into());
    }
    Ok(body)
}

/// Replaces a map's saved entries with this pass's (each player's score) and its fingerprint.
async fn save_snapshot(pool: &PgPool, map_id: &str, entries: &[(String, i32)], digest: i64) -> Result<(), sqlx::Error> {
    let mut seen: HashSet<&str> = HashSet::new();
    let (players, scores): (Vec<String>, Vec<i32>) = entries.iter().filter(|(p, _)| seen.insert(p.as_str())).cloned().unzip();
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM steam_sync_entries WHERE map_id = $1").bind(map_id).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO steam_sync_entries (map_id, profile_number, score) SELECT $1, p, s FROM unnest($2::text[], $3::int[]) AS t(p, s)")
        .bind(map_id)
        .bind(&players)
        .bind(&scores)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        r#"
            INSERT INTO steam_sync_maps (map_id, last_hash, last_pass) VALUES ($1, $2, now() AT TIME ZONE 'utc')
            ON CONFLICT (map_id) DO UPDATE SET last_hash = EXCLUDED.last_hash, last_pass = EXCLUDED.last_pass
        "#,
    )
    .bind(map_id)
    .bind(digest)
    .execute(&mut *tx)
    .await?;
    tx.commit().await
}

/// A fingerprint of a leaderboard body, kept per map so an unchanged board is skipped.
fn hash_of(body: &str) -> i64 {
    let mut h = DefaultHasher::new();
    body.hash(&mut h);
    h.finish() as i64
}

fn between<'a>(s: &'a str, open: &str, close: &str) -> Option<&'a str> {
    let start = s.find(open)? + open.len();
    let end = s[start..].find(close)? + start;
    Some(&s[start..end])
}

/// (steam id, score) per `<entry>`, in leaderboard order. Steam's format is fixed, so a plain
/// scan does; scores that aren't positive (hacked uploads show as -2147483648) are dropped.
pub fn parse_entries(body: &str) -> Vec<(String, i32)> {
    let mut out = Vec::new();
    let mut rest = body;
    while let Some(start) = rest.find("<entry>") {
        rest = &rest[start + 7..];
        let Some(end) = rest.find("</entry>") else { break };
        let entry = &rest[..end];
        rest = &rest[end + 8..];
        let (Some(id), Some(score)) = (between(entry, "<steamid>", "</steamid>"), between(entry, "<score>", "</score>")) else { continue };
        let Ok(score) = score.trim().parse::<i32>() else { continue };
        let id = id.trim();
        if score > 0 && id.len() == 17 && id.bytes().all(|b| b.is_ascii_digit()) {
            out.push((id.to_string(), score));
        }
    }
    out
}

/// Records the new times on one map (entries that changed since `previous`); returns how many
/// were added.
async fn sync_map(
    pool: &PgPool,
    config: &Config,
    map: &BoardMap,
    entries: &[(String, i32)],
    previous: &HashMap<String, i32>,
    banned: &HashSet<String>,
    report: &mut SyncReport,
) -> Result<usize, sqlx::Error> {
    let cat = map.default_cat_id.unwrap_or_default();
    let limit = config.sync.rank_limit();

    // Candidates: within the top `limit` of Steam's valid entries, not banned, and better than
    // anything the player has on the map. Rank is 1 + the valid entries ahead (ties share it).
    let mut candidates: Vec<(String, i32)> = Vec::new();
    let mut seen: HashSet<&str> = HashSet::new();
    let mut position = 0;
    let mut rank = 0;
    let mut last_score: Option<i32> = None;
    for (profile, score) in entries {
        if !seen.insert(profile.as_str()) || banned.contains(profile) || profile == FILLER {
            continue;
        }
        position += 1;
        if last_score != Some(*score) {
            rank = position;
            last_score = Some(*score);
        }
        if rank > limit {
            break;
        }
        // Unchanged since the last pass: nothing new (also keeps removed runs out).
        if previous.get(profile) == Some(score) {
            continue;
        }
        if improves(pool, profile, &map.steam_id, cat, *score).await? && !moderation::is_frozen(pool, profile).await? {
            candidates.push((profile.clone(), *score));
        }
    }
    if candidates.is_empty() {
        return Ok(0);
    }

    // Co-op: two new entries with the same score were set together.
    let mut partner_of: HashMap<String, String> = HashMap::new();
    if map.is_coop {
        let mut taken: HashSet<String> = HashSet::new();
        for (i, (a, score)) in candidates.iter().enumerate() {
            if taken.contains(a) {
                continue;
            }
            if let Some((b, _)) = candidates.iter().skip(i + 1).find(|(b, s)| s == score && !taken.contains(b)) {
                partner_of.insert(a.clone(), b.clone());
                partner_of.insert(b.clone(), a.clone());
                taken.insert(a.clone());
                taken.insert(b.clone());
            }
        }
    }

    let mut added = 0;
    let mut recorded: HashSet<String> = HashSet::new();
    for (profile, score) in &candidates {
        if ensure_user(pool, config, profile).await? {
            report.players_created += 1;
        }
        // The second half of a pair names the first as its partner, which bundles them.
        let partner = partner_of.get(profile).filter(|p| recorded.contains(*p)).map(String::as_str);
        let pending = submissions::needs_proof(pool, &map.steam_id, cat, profile, *score).await?;
        let run = NewRun {
            map,
            profile_number: profile,
            score: *score,
            youtube_id: None,
            note: None,
            partner,
            demo_file: None,
            demo_partner_name: None,
            portals: None,
            submission: 0,
            verified: Some(!pending),
        };
        match submissions::insert_run(pool, run).await? {
            Ok(_) => {
                added += 1;
                recorded.insert(profile.clone());
                if pending {
                    report.runs_pending += 1;
                }
            }
            Err(refused) => log::debug!("steam sync: {} on {}: {refused:?}", profile, map.name),
        }
    }
    report.runs_added += added;
    Ok(added)
}

/// Whether `score` beats the player's best recorded time on the map (any status), and isn't a
/// time of theirs that was banned.
async fn improves(pool: &PgPool, profile: &str, map_id: &str, cat: i32, score: i32) -> Result<bool, sqlx::Error> {
    let (best, banned_same): (Option<i32>, Option<bool>) = sqlx::query_as(
        r#"
            SELECT MIN(score) FILTER (WHERE NOT banned), bool_or(score = $4 AND banned)
            FROM changelog WHERE profile_number = $1 AND map_id = $2 AND category_id = $3
        "#,
    )
    .bind(profile)
    .bind(map_id)
    .bind(cat)
    .bind(score)
    .fetch_one(pool)
    .await?;
    Ok(best.map_or(true, |b| score < b) && banned_same != Some(true))
}

/// Makes sure the player has an account (from the Steam Web API when it's configured); returns
/// whether one was created.
pub(crate) async fn ensure_user(pool: &PgPool, config: &Config, profile: &str) -> Result<bool, sqlx::Error> {
    let exists: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM users WHERE profile_number = $1)").bind(profile).fetch_one(pool).await?;
    if exists {
        return Ok(false);
    }
    let steam: Option<Users> = match has_api_key(config) {
        false => None,
        true => match Users::new_from_steam(config.steam.api_key.trim(), profile).await {
            Ok(user) => Some(user),
            // Filled in by a later pass (fill_missing_profiles).
            Err(e) => {
                log::warn!("steam sync: no Steam profile for {profile} yet: {}", e.error_message);
                None
            }
        },
    };
    sqlx::query(
        r#"
            INSERT INTO users (profile_number, steam_name, avatar, banned, registered, admin)
            VALUES ($1, $2, $3, false, 0, 0)
            ON CONFLICT (profile_number) DO NOTHING
        "#,
    )
    .bind(profile)
    .bind(steam.as_ref().and_then(|u| u.steam_name.clone()))
    .bind(steam.as_ref().and_then(|u| u.avatar.clone()))
    .execute(pool)
    .await?;
    Users::set_default_country(pool, profile, steam.as_ref().and_then(|u| u.steam_country.as_deref())).await?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::parse_entries;

    #[test]
    fn parses_entries_and_drops_hacked_scores() {
        let xml = r#"<response><entries><entry><steamid>76561197961322276</steamid><score>-2147483648</score><rank>1</rank></entry>
            <entry><steamid>76561198817948339</steamid><score>3035</score><rank>2000</rank></entry>
            <entry><steamid>bad</steamid><score>10</score></entry></entries></response>"#;
        assert_eq!(parse_entries(xml), vec![("76561198817948339".to_string(), 3035)]);
    }
}
