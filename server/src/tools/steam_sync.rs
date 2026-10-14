//! Pulls new Portal 2 times from Steam. Challenge mode uploads every player's best time per map
//! to Steam's leaderboards (each map's `steam_id` is its leaderboard), and this job reads them
//! back: every `SYNC.MINUTES` it fetches the top of each map's leaderboard and records any time
//! that beats what the board has for that player, the way the old boards' fetcher did.
//!
//! Steam's leaderboards carry no dates, so the first pass over a map is a baseline: the times it
//! finds are recorded undated (like imported undated runs) rather than as new runs. From then on,
//! a change on Steam since the previous pass is a new run and is dated when it's seen. The pass
//! state lives in `steam_sync_maps`.
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
    models::users::Users,
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
    /// Of those, found on a map's first pass and recorded undated.
    pub runs_baseline: usize,
    pub runs_pending: usize,
    pub players_created: usize,
}

/// One cycle at a time (the schedule and the staff endpoint share it).
static RUNNING: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Starts the schedule (no-op when `SYNC.STEAM` is off).
pub fn start(pool: PgPool, config: Config, cache: CacheState) {
    if !config.sync.steam() {
        log::info!("steam sync: off (SYNC.STEAM)");
        return;
    }
    let every = Duration::from_secs(config.sync.minutes() * 60);
    tokio::spawn(async move {
        // Let the caches warm first.
        tokio::time::sleep(Duration::from_secs(30)).await;
        loop {
            match run_once(&pool, &config, &cache, None).await {
                Ok(r) => log::info!(
                    "steam sync: {} maps checked ({} unchanged, {} failed), {} runs added ({} baseline, {} pending), {} players created",
                    r.maps_checked, r.maps_unchanged, r.maps_failed, r.runs_added, r.runs_baseline, r.runs_pending, r.players_created
                ),
                Err(e) => log::error!("steam sync failed: {e}"),
            }
            tokio::time::sleep(every).await;
        }
    });
}

/// One pass over every Portal 2 map (or just `only`, a map's steam id, to try it on one map).
/// `Err` only for failures that stop the whole pass (the database); a map whose leaderboard
/// can't be read is counted in `maps_failed`.
pub async fn run_once(pool: &PgPool, config: &Config, cache: &CacheState, only: Option<&str>) -> Result<SyncReport, sqlx::Error> {
    let _guard = RUNNING.lock().await;
    let mut report = SyncReport::default();
    let maps = sqlx::query_as::<_, BoardMap>(
        r#"
            SELECT m.steam_id, m.name, c.game_id, c.game_mode, c.is_multiplayer AS is_coop, m.default_cat_id
            FROM maps AS m JOIN chapters AS c ON c.id = m.chapter_id
            WHERE c.game_id = $1 AND m.default_cat_id IS NOT NULL AND ($2::text IS NULL OR m.steam_id = $2)
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
        let state: Option<(bool, Option<i64>)> = sqlx::query_as("SELECT baseline_done, last_hash FROM steam_sync_maps WHERE map_id = $1")
            .bind(&map.steam_id)
            .fetch_optional(pool)
            .await?;
        let baseline = !state.map_or(false, |s| s.0);
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
        if !baseline && state.and_then(|s| s.1) == Some(digest) {
            report.maps_unchanged += 1;
            continue;
        }
        let entries = parse_entries(&body);
        match sync_map(pool, config, map, &entries, &banned, baseline, &mut report).await {
            Ok(added) => {
                sqlx::query(
                    r#"
                        INSERT INTO steam_sync_maps (map_id, baseline_done, last_hash, last_pass)
                        VALUES ($1, true, $2, now() AT TIME ZONE 'utc')
                        ON CONFLICT (map_id) DO UPDATE SET baseline_done = true, last_hash = EXCLUDED.last_hash, last_pass = EXCLUDED.last_pass
                    "#,
                )
                .bind(&map.steam_id)
                .bind(digest)
                .execute(pool)
                .await?;
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
    if any_added {
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

/// Records the new times on one map; returns how many were added.
async fn sync_map(pool: &PgPool, config: &Config, map: &BoardMap, entries: &[(String, i32)], banned: &HashSet<String>, baseline: bool, report: &mut SyncReport) -> Result<usize, sqlx::Error> {
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
        if !ensure_user(pool, config, profile, report).await? {
            continue;
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
            baseline,
        };
        match submissions::insert_run(pool, run).await? {
            Ok(_) => {
                added += 1;
                recorded.insert(profile.clone());
                if pending {
                    report.runs_pending += 1;
                }
                if baseline {
                    report.runs_baseline += 1;
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

/// Makes sure the player has an account (from the Steam Web API when it's configured).
async fn ensure_user(pool: &PgPool, config: &Config, profile: &str, report: &mut SyncReport) -> Result<bool, sqlx::Error> {
    let exists: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM users WHERE profile_number = $1)").bind(profile).fetch_one(pool).await?;
    if exists {
        return Ok(true);
    }
    let steam: Option<Users> = match config.steam.api_key.as_str() {
        "" | "unused" => None,
        key => Users::new_from_steam(key, profile).await.ok(),
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
    report.players_created += 1;
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
