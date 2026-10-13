//! Run submissions from demos.
//!
//! A submitted demo is parsed by the Node script in `server/demo-parser` (map, the
//! challenge mode scoreboard time, and the players in it). Players submit their own runs
//! straight from their demo: the map and time are what the demo says. Admins can also enter
//! the map, time, player or partner by hand (with or without a demo), and those submissions
//! are recorded in the audit log.
use crate::{
    controllers::moderation::{self, Refused, FILLER},
    tools::config::DemoConfig,
};
use sqlx::{FromRow, PgPool};
use std::{path::Path, time::Duration};

/// How long the demo parser may take.
const PARSE_TIMEOUT: Duration = Duration::from_secs(30);

/// A player found in a demo.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoPlayer {
    pub steam_id: String,
    pub name: String,
}

/// What the parser reads from a demo.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoInfo {
    pub map_name: Option<String>,
    pub game_directory: Option<String>,
    pub client_name: Option<String>,
    /// Board time in centiseconds, from the end-of-run scoreboard (None: no finished run).
    pub time_score: Option<i32>,
    pub portal_score: Option<i32>,
    #[serde(default)]
    pub players: Vec<DemoPlayer>,
}

/// Runs the demo parser on a saved demo.
pub async fn parse_demo(config: &DemoConfig, path: &Path) -> Result<DemoInfo, String> {
    let parser = config.parser.as_deref().filter(|p| !p.is_empty()).ok_or("Demo checking isn't set up on this server.")?;
    let node = config.node.as_deref().filter(|n| !n.is_empty()).unwrap_or("node");
    let run = tokio::process::Command::new(node).arg(parser).arg(path).kill_on_drop(true).output();
    let output = match tokio::time::timeout(PARSE_TIMEOUT, run).await {
        Err(_) => return Err("Reading the demo took too long.".into()),
        Ok(Err(e)) => {
            log::error!("demo parser failed to start: {e}");
            return Err("Demo checking isn't available right now.".into());
        }
        Ok(Ok(o)) => o,
    };
    if !output.status.success() {
        log::warn!("demo parser: {}", String::from_utf8_lossy(&output.stderr).trim());
        return Err("That file couldn't be read as a Portal 2 demo.".into());
    }
    serde_json::from_slice(&output.stdout).map_err(|e| {
        log::error!("demo parser output: {e}");
        "That file couldn't be read as a Portal 2 demo.".to_string()
    })
}

/// A board map a demo can be for.
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct BoardMap {
    pub steam_id: String,
    pub name: String,
    pub game_id: i32,
    pub game_mode: String,
    pub is_coop: bool,
    pub default_cat_id: Option<i32>,
}

/// Board maps for a demo's map file (Mel's Story and Advanced maps share one).
pub async fn maps_for_bsp(pool: &PgPool, bsp: &str) -> Result<Vec<BoardMap>, sqlx::Error> {
    sqlx::query_as::<_, BoardMap>(
        r#"
            SELECT m.steam_id, m.name, c.game_id, c.game_mode, c.is_multiplayer AS is_coop, m.default_cat_id
            FROM maps AS m JOIN chapters AS c ON c.id = m.chapter_id
            WHERE lower(m.bsp_name) = lower($1)
            ORDER BY c.game_id, m.id
        "#,
    )
    .bind(bsp)
    .fetch_all(pool)
    .await
}

pub async fn map_by_id(pool: &PgPool, steam_id: &str) -> Result<Option<BoardMap>, sqlx::Error> {
    sqlx::query_as::<_, BoardMap>(
        r#"
            SELECT m.steam_id, m.name, c.game_id, c.game_mode, c.is_multiplayer AS is_coop, m.default_cat_id
            FROM maps AS m JOIN chapters AS c ON c.id = m.chapter_id
            WHERE m.steam_id = $1
        "#,
    )
    .bind(steam_id)
    .fetch_optional(pool)
    .await
}

/// The run to insert, after checks.
pub struct NewRun<'a> {
    pub map: &'a BoardMap,
    pub profile_number: &'a str,
    pub score: i32,
    pub youtube_id: Option<String>,
    pub note: Option<String>,
    pub partner: Option<&'a str>,
    /// File name of the saved demo (in the demo storage directory), if any.
    pub demo_file: Option<String>,
    pub demo_partner_name: Option<String>,
}

/// Runs that would rank this high or better need a demo; without one they're pending (no
/// points, not on the boards) until a demo is added or staff verify them.
pub const PROOF_RANK: i32 = 200;

/// Players whose best (verified, unbanned, in the category) is faster than a time.
const FASTER_PLAYERS: &str = r#"
    SELECT COUNT(DISTINCT cl.profile_number) FROM changelog AS cl
    JOIN users AS u ON u.profile_number = cl.profile_number
    WHERE cl.map_id = $1 AND cl.category_id = $2 AND cl.score < $3
      AND cl.verified AND NOT cl.banned AND NOT u.banned
      AND cl.profile_number <> $4 AND cl.profile_number <> $5
"#;

/// Rank a time would have on a map: 1 + players whose best is faster, the same ranking the
/// boards use.
async fn rank_for(tx: &mut sqlx::Transaction<'_, sqlx::Postgres>, map: &BoardMap, profile_number: &str, score: i32) -> Result<i32, sqlx::Error> {
    let faster: i64 = sqlx::query_scalar(FASTER_PLAYERS)
        .bind(&map.steam_id)
        .bind(map.default_cat_id)
        .bind(score)
        .bind(profile_number)
        .bind(FILLER)
        .fetch_one(&mut **tx)
        .await?;
    Ok(faster as i32 + 1)
}

/// Whether a new run without a demo would be pending: it would rank within [PROOF_RANK].
pub async fn needs_proof(pool: &PgPool, map_id: &str, category_id: i32, profile_number: &str, score: i32) -> Result<bool, sqlx::Error> {
    let faster: i64 = sqlx::query_scalar(FASTER_PLAYERS)
        .bind(map_id)
        .bind(category_id)
        .bind(score)
        .bind(profile_number)
        .bind(FILLER)
        .fetch_one(pool)
        .await?;
    Ok(faster as i32 + 1 <= PROOF_RANK)
}

/// A run a demo is being added to.
#[derive(Debug, FromRow)]
pub struct ProofTarget {
    pub id: i64,
    pub profile_number: String,
    pub score: i32,
    pub map_id: String,
    pub bsp_name: Option<String>,
    pub is_coop: bool,
    pub coop_id: Option<i64>,
    pub demo_id: Option<i64>,
    pub banned: bool,
    pub verified: Option<bool>,
    /// Both players of a co-op run (None for singleplayer).
    pub p_id1: Option<String>,
    pub p_id2: Option<String>,
}

pub async fn proof_target(pool: &PgPool, cl_id: i64) -> Result<Option<ProofTarget>, sqlx::Error> {
    sqlx::query_as::<_, ProofTarget>(
        r#"
            SELECT cl.id, cl.profile_number, cl.score, cl.map_id, m.bsp_name, c.is_multiplayer AS is_coop,
                cl.coop_id, cl.demo_id, cl.banned, cl.verified, cb.p_id1, cb.p_id2
            FROM changelog AS cl
            JOIN maps AS m ON m.steam_id = cl.map_id JOIN chapters AS c ON c.id = m.chapter_id
            LEFT JOIN coop_bundled AS cb ON cb.id = cl.coop_id
            WHERE cl.id = $1 AND cl.profile_number <> $2
        "#,
    )
    .bind(cl_id)
    .bind(FILLER)
    .fetch_optional(pool)
    .await
}

/// Attaches a demo to a pending run and verifies it (both halves of a co-op run).
pub async fn attach_proof(pool: &PgPool, run: &ProofTarget, demo_file: &str, partner_name: Option<&str>) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    let demo_id: i64 = sqlx::query_scalar("INSERT INTO demos (file_id, partner_name, parsed_successfully, cl_id) VALUES ($1, $2, true, $3) RETURNING id")
        .bind(demo_file)
        .bind(partner_name)
        .bind(run.id)
        .fetch_one(&mut *tx)
        .await?;
    sqlx::query("UPDATE changelog SET demo_id = $2, verified = true WHERE id = $1").bind(run.id).bind(demo_id).execute(&mut *tx).await?;
    if let Some(coop_id) = run.coop_id {
        sqlx::query("UPDATE changelog SET verified = true WHERE id IN (SELECT unnest(ARRAY[cl_id1, cl_id2]) FROM coop_bundled WHERE id = $1) AND profile_number <> $2")
            .bind(coop_id)
            .bind(FILLER)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await
}

/// Inserts a submitted run (with its demo and co-op pairing) in one transaction. Refuses times
/// that aren't an improvement on the player's personal best. Returns the new changelog id.
pub async fn insert_run(pool: &PgPool, run: NewRun<'_>) -> Result<Result<i64, Refused>, sqlx::Error> {
    let Some(category) = run.map.default_cat_id else {
        return Ok(Err(Refused::Invalid("That map has no board category.".into())));
    };
    let mut tx = pool.begin().await?;
    let previous: Option<(i64, i32)> = sqlx::query_as(
        r#"
            SELECT id, score FROM changelog
            WHERE profile_number = $1 AND map_id = $2 AND category_id = $3 AND verified AND NOT banned
            ORDER BY score ASC, timestamp ASC LIMIT 1
        "#,
    )
    .bind(run.profile_number)
    .bind(&run.map.steam_id)
    .bind(category)
    .fetch_optional(&mut *tx)
    .await?;
    if let Some((_, pb)) = previous {
        if run.score >= pb {
            return Ok(Err(Refused::Invalid(format!(
                "This isn't faster than your current best on {} ({}).",
                run.map.name,
                format_time(pb)
            ))));
        }
    }
    let pre_rank = match previous {
        Some((_, pb)) => Some(rank_for(&mut tx, run.map, run.profile_number, pb).await?),
        None => None,
    };
    let post_rank = rank_for(&mut tx, run.map, run.profile_number, run.score).await?;
    let id: i64 = sqlx::query_scalar(
        r#"
            INSERT INTO changelog (timestamp, profile_number, score, map_id, banned, youtube_id, previous_id,
                post_rank, pre_rank, submission, note, category_id, score_delta, verified)
            VALUES (now() AT TIME ZONE 'utc', $1, $2, $3, false, $4, $5, $6, $7, 1, $8, $9, $10, true)
            RETURNING id
        "#,
    )
    .bind(run.profile_number)
    .bind(run.score)
    .bind(&run.map.steam_id)
    .bind(&run.youtube_id)
    .bind(previous.map(|p| p.0))
    .bind(post_rank)
    .bind(pre_rank)
    .bind(&run.note)
    .bind(category)
    .bind(previous.map(|p| run.score - p.1))
    .fetch_one(&mut *tx)
    .await?;
    if let Some(file) = &run.demo_file {
        let demo_id: i64 = sqlx::query_scalar(
            "INSERT INTO demos (file_id, partner_name, parsed_successfully, cl_id) VALUES ($1, $2, true, $3) RETURNING id",
        )
        .bind(file)
        .bind(&run.demo_partner_name)
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;
        sqlx::query("UPDATE changelog SET demo_id = $2 WHERE id = $1").bind(id).bind(demo_id).execute(&mut *tx).await?;
    }
    if run.map.is_coop {
        match run.partner {
            Some(partner) => {
                if let Err(refused) = moderation::pair_partner(&mut tx, id, partner).await? {
                    return Ok(Err(refused));
                }
            }
            None => {
                let filler: Option<i64> = sqlx::query_scalar("SELECT id FROM changelog WHERE profile_number = $1 AND map_id = $2 ORDER BY id LIMIT 1")
                    .bind(FILLER)
                    .bind(&run.map.steam_id)
                    .fetch_optional(&mut *tx)
                    .await?;
                if let Some(filler) = filler {
                    moderation::pair_with_filler(&mut tx, id, run.profile_number, filler).await?;
                }
            }
        }
    }
    tx.commit().await?;
    Ok(Ok(id))
}

/// Board time format: 1:23.45 / 23.45.
pub fn format_time(cs: i32) -> String {
    let (m, s, h) = (cs / 6000, (cs % 6000) / 100, cs % 100);
    if m > 0 {
        format!("{m}:{s:02}.{h:02}")
    } else {
        format!("{s}.{h:02}")
    }
}

/// The YouTube video id from a link or id (None when it isn't one).
pub fn youtube_id(input: &str) -> Option<String> {
    let s = input.trim();
    if s.is_empty() {
        return None;
    }
    let id = if let Some(rest) = s.split("youtu.be/").nth(1) {
        rest.to_string()
    } else if let Some(rest) = s.split("v=").nth(1) {
        rest.to_string()
    } else if let Some(rest) = s.split("/shorts/").nth(1) {
        rest.to_string()
    } else {
        s.to_string()
    };
    let id: String = id.chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').collect();
    (id.len() == 11).then_some(id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn youtube_ids() {
        assert_eq!(youtube_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3").as_deref(), Some("dQw4w9WgXcQ"));
        assert_eq!(youtube_id("https://youtu.be/dQw4w9WgXcQ?t=1").as_deref(), Some("dQw4w9WgXcQ"));
        assert_eq!(youtube_id("dQw4w9WgXcQ").as_deref(), Some("dQw4w9WgXcQ"));
        assert_eq!(youtube_id("not a video"), None);
    }

    #[test]
    fn times() {
        assert_eq!(format_time(2243), "22.43");
        assert_eq!(format_time(11783), "1:57.83");
    }
}
