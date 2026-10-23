//! Discord announcements of new world records, one webhook per game (`games.wr_webhook_url`, set by
//! admins in the games editor; seasons have their own), like the old boards' and Mel board's WR
//! webhooks.
//!
//! The old boards posted a WR when it got its demo. Here every WR needs proof before it's verified,
//! so a run is announced once it's verified and holds rank 1 on its map (ties count). A background
//! task checks newly verified runs every [INTERVAL], whichever way they came in (submission, SAR,
//! a demo added later, a staff verify, the Steam sync). Each run is checked once
//! (`wr_announcements`), a co-op run is one post naming both players, and only runs after
//! `wr_announcer_state.after_id` (the newest run when this was set up) are looked at, so no old WR
//! is ever posted. Runs from the old boards' sync are skipped: the old boards announced those.
use crate::{controllers::submissions::format_time, tools::config::Config};
use reqwest::{StatusCode, Url};
use serde_json::{json, Value};
use sqlx::{FromRow, PgPool};
use std::{collections::HashSet, time::Duration};

/// How often newly verified runs are checked.
const INTERVAL: Duration = Duration::from_secs(30);
/// Runs looked at per check.
const BATCH: i64 = 100;
/// The old boards' embed colour.
const COLOR: u32 = 295077;
/// Hosts a webhook may point at.
const DISCORD_HOSTS: [&str; 4] = ["discord.com", "discordapp.com", "canary.discord.com", "ptb.discord.com"];

/// Whether `url` is a Discord webhook (`https://discord.com/api/webhooks/{id}/{token}`, or an
/// `/api/v{n}/` one). Nothing else is accepted, so the server can't be made to post anywhere else.
pub fn valid_webhook(url: &str) -> bool {
    let Ok(u) = Url::parse(url) else {
        return false;
    };
    if u.scheme() != "https" || u.port().is_some() || u.query().is_some() || u.fragment().is_some() || !u.username().is_empty() {
        return false;
    }
    if !u.host_str().is_some_and(|h| DISCORD_HOSTS.contains(&h)) {
        return false;
    }
    let parts: Vec<&str> = u.path().trim_start_matches('/').split('/').collect();
    let rest = match parts.as_slice() {
        ["api", "webhooks", rest @ ..] => rest,
        ["api", v, "webhooks", rest @ ..] if v.strip_prefix('v').is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit())) => rest,
        _ => return false,
    };
    matches!(rest, [id, token]
        if !id.is_empty() && id.bytes().all(|b| b.is_ascii_digit())
            && !token.is_empty() && token.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'))
}

/// The webhook with its secret token hidden, for showing in the editor: `…/webhooks/123/…abcd`.
pub fn masked(url: &str) -> String {
    match url.rsplit_once('/') {
        Some((head, token)) if token.len() > 4 => format!("{head}/…{}", &token[token.len() - 4..]),
        _ => "…".to_string(),
    }
}

/// Text as Discord shows it, without its formatting characters taking effect.
fn escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        if matches!(c, '\\' | '*' | '_' | '`' | '~' | '|' | '[' | ']' | '(' | ')' | '<' | '>' | '#' | '@') {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// One WR to announce.
#[derive(Debug, Clone, PartialEq)]
pub struct Announcement {
    pub game_id: i32,
    pub game_name: String,
    pub game_has_logo: bool,
    pub map_name: String,
    /// The chapter's board key (`sp`, `coop`, `story`, ...), for the map page's address.
    pub mode: String,
    pub map_id: String,
    pub thumbnail: Option<String>,
    pub score: i32,
    /// The best time on the map before this run was recorded (another player's, or the player's own), if any.
    pub previous: Option<i32>,
    /// (profile number, name): one player, or both of a co-op run.
    pub players: Vec<(String, String)>,
    pub timestamp: Option<chrono::NaiveDateTime>,
}

/// The webhook message for a WR: an embed like the old boards' (map, WR time and improvement, who).
pub fn payload(a: &Announcement, public_url: &str) -> Value {
    let wr = match a.previous {
        Some(p) if p > a.score => format!("{} (-{})", format_time(a.score), format_time(p - a.score)),
        Some(p) if p == a.score => format!("{} (tie)", format_time(a.score)),
        _ => format_time(a.score),
    };
    let by = a
        .players
        .iter()
        .map(|(id, name)| format!("[{}](<{public_url}/profile/{id}>)", escape(name)))
        .collect::<Vec<_>>()
        .join(" & ");
    let map_url = format!("{public_url}/map/{}/{}", a.mode, urlencoding(&a.map_id));
    let mut embed = json!({
        "title": a.map_name,
        "url": map_url,
        "color": COLOR,
        "fields": [
            { "name": "WR", "value": wr, "inline": true },
            { "name": "By", "value": by, "inline": true },
        ],
    });
    if let Some(thumb) = &a.thumbnail {
        embed["thumbnail"] = json!({ "url": thumb });
    }
    if let Some(ts) = a.timestamp {
        embed["timestamp"] = json!(ts.and_utc().to_rfc3339());
    }
    let mut body = json!({
        "username": a.game_name.chars().take(80).collect::<String>(),
        "embeds": [embed],
        // Names are players' own: never let one ping anyone.
        "allowed_mentions": { "parse": [] },
    });
    if a.game_has_logo {
        body["avatar_url"] = json!(format!("{public_url}/api/v1/games/{}/images/logo", a.game_id));
    }
    body
}

fn urlencoding(s: &str) -> String {
    s.bytes()
        .map(|b| if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' { (b as char).to_string() } else { format!("%{b:02X}") })
        .collect()
}

/// A map's thumbnail: its picture from the games editor, else the old boards' thumbnail for Portal 2
/// and Mel maps (by the map, or for a season's copy its source map); none otherwise.
fn thumbnail(public_url: &str, map_id: &str, image_version: Option<i64>, base_slug: &str, source_map: &str) -> Option<String> {
    if let Some(v) = image_version {
        return Some(format!("{public_url}/api/v1/maps/{}/image?v={v}", urlencoding(map_id)));
    }
    match base_slug {
        "portal2" => Some(format!("https://raw.githubusercontent.com/p2sr/Portal2Boards/master/public/images/thumbnails/{}.jpg", urlencoding(source_map))),
        "mel" => Some(format!("https://raw.githubusercontent.com/NeKzor/board/mel/public/images/thumbnails/{}.jpg", urlencoding(source_map))),
        _ => None,
    }
}

/// Why a post didn't go through.
#[derive(Debug)]
pub enum PostError {
    /// Worth trying again later (network, Discord busy or rate limiting).
    Retry(String),
    /// Discord refused it (the webhook was deleted, say): don't try this run again.
    Refused(String),
}

/// Posts `body` to the webhook.
pub async fn post(url: &str, body: &Value) -> Result<(), PostError> {
    let res = crate::tools::helpers::http_client().post(url).json(body).send().await.map_err(|e| PostError::Retry(e.to_string()))?;
    let status = res.status();
    if status.is_success() {
        return Ok(());
    }
    let text = res.text().await.unwrap_or_default().chars().take(200).collect::<String>();
    if status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error() {
        Err(PostError::Retry(format!("{status}: {text}")))
    } else {
        Err(PostError::Refused(format!("{status}: {text}")))
    }
}

/// A newly verified run, with what deciding and announcing need.
#[derive(Debug, FromRow)]
struct Candidate {
    id: i64,
    score: i32,
    map_id: String,
    map_name: String,
    mode: String,
    timestamp: Option<chrono::NaiveDateTime>,
    game_id: i32,
    game_name: String,
    game_has_logo: bool,
    base_slug: String,
    source_map: String,
    image_version: Option<i64>,
    webhook: Option<String>,
    from_old_boards: bool,
    is_wr: bool,
    previous: Option<i32>,
    coop_id: Option<i64>,
    /// The co-op run's other half, when it has already been checked.
    partner_checked: bool,
    players: Vec<String>,
}

const CANDIDATES: &str = r#"
    SELECT cl.id, cl.score, cl.map_id, m.name AS map_name, c.game_mode AS mode, cl.timestamp,
           g.id AS game_id, g.game_name, g.logo_file IS NOT NULL AS game_has_logo,
           COALESCE(bg.slug, g.slug, '') AS base_slug, COALESCE(m.source_map, m.steam_id) AS source_map,
           CASE WHEN m.image_file IS NOT NULL THEN extract(epoch FROM m.image_updated)::bigint END AS image_version,
           NULLIF(g.wr_webhook_url, '') AS webhook,
           EXISTS (SELECT 1 FROM legacy_changelog_ids AS l WHERE l.changelog_id IN (cl.id, cl.mirror_of)) AS from_old_boards,
           -- Rank 1: no faster time by an unbanned player ('N/A' is the co-op placeholder, not a player).
           (cl.category_id = m.default_cat_id AND cl.profile_number <> 'N/A' AND NOT COALESCE(u.banned, false) AND NOT EXISTS (
                SELECT 1 FROM changelog AS o LEFT JOIN users AS ou ON ou.profile_number = o.profile_number
                WHERE o.map_id = cl.map_id AND o.category_id = cl.category_id AND o.verified AND NOT o.banned
                  AND o.profile_number <> 'N/A' AND NOT COALESCE(ou.banned, false) AND o.score < cl.score)) AS is_wr,
           (SELECT min(o.score) FROM changelog AS o LEFT JOIN users AS ou ON ou.profile_number = o.profile_number
                WHERE o.map_id = cl.map_id AND o.category_id = cl.category_id AND o.verified AND NOT o.banned
                  AND o.profile_number <> 'N/A' AND NOT COALESCE(ou.banned, false) AND o.id < cl.id
                  AND (cl.coop_id IS NULL OR o.coop_id IS DISTINCT FROM cl.coop_id)) AS previous,
           cl.coop_id,
           EXISTS (SELECT 1 FROM coop_bundled AS cb JOIN wr_announcements AS a ON a.changelog_id IN (cb.cl_id1, cb.cl_id2)
                   WHERE cb.id = cl.coop_id) AS partner_checked,
           CASE WHEN cl.coop_id IS NULL THEN ARRAY[cl.profile_number]::text[]
                ELSE (SELECT ARRAY_REMOVE(ARRAY[cb.p_id1, cb.p_id2], 'N/A')::text[] FROM coop_bundled AS cb WHERE cb.id = cl.coop_id) END AS players
    FROM changelog AS cl
    JOIN maps AS m ON m.steam_id = cl.map_id
    JOIN chapters AS c ON c.id = m.chapter_id
    JOIN games AS g ON g.id = c.game_id
    LEFT JOIN games AS bg ON bg.id = g.base_game_id
    LEFT JOIN users AS u ON u.profile_number = cl.profile_number
    WHERE cl.id > (SELECT after_id FROM wr_announcer_state)
      AND cl.verified AND NOT cl.banned
      AND NOT EXISTS (SELECT 1 FROM wr_announcements AS a WHERE a.changelog_id = cl.id)
    ORDER BY cl.id
    LIMIT $1
"#;

async fn mark(pool: &PgPool, id: i64, posted: bool) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO wr_announcements (changelog_id, posted) VALUES ($1, $2) ON CONFLICT DO NOTHING").bind(id).bind(posted).execute(pool).await?;
    Ok(())
}

async fn names(pool: &PgPool, ids: &[String]) -> Result<Vec<(String, String)>, sqlx::Error> {
    let rows: Vec<(String, String)> = sqlx::query_as("SELECT profile_number, COALESCE(board_name, steam_name, profile_number) FROM users WHERE profile_number = ANY($1)")
        .bind(ids)
        .fetch_all(pool)
        .await?;
    // In the run's order (host first for co-op), and every player even without a users row.
    Ok(ids.iter().map(|id| rows.iter().find(|(p, _)| p == id).cloned().unwrap_or_else(|| (id.clone(), id.clone()))).collect())
}

/// What a check did.
#[derive(Debug, Default, PartialEq)]
pub struct Checked {
    pub looked_at: usize,
    pub posted: usize,
}

/// Checks the newly verified runs once: posts the WRs to their game's webhook and marks every run
/// it looked at. A post that fails for a reason worth retrying leaves its run (and the rest) for
/// the next check. `send` does the posting (the real one is [post]).
pub async fn check<F, Fut>(pool: &PgPool, public_url: &str, send: F) -> Result<Checked, sqlx::Error>
where
    F: Fn(String, Value) -> Fut,
    Fut: std::future::Future<Output = Result<(), PostError>>,
{
    let candidates = sqlx::query_as::<_, Candidate>(CANDIDATES).bind(BATCH).fetch_all(pool).await?;
    let mut done = Checked { looked_at: candidates.len(), ..Default::default() };
    let mut coop_done: HashSet<i64> = HashSet::new();
    for c in candidates {
        let coop_handled = c.coop_id.is_some_and(|id| c.partner_checked || coop_done.contains(&id));
        let Some(webhook) = c.webhook.as_deref().filter(|_| c.is_wr && !c.from_old_boards && !coop_handled) else {
            mark(pool, c.id, false).await?;
            if let Some(id) = c.coop_id {
                coop_done.insert(id);
            }
            continue;
        };
        let a = Announcement {
            game_id: c.game_id,
            game_name: c.game_name.clone(),
            game_has_logo: c.game_has_logo,
            map_name: c.map_name.clone(),
            mode: c.mode.clone(),
            map_id: c.map_id.clone(),
            thumbnail: thumbnail(public_url, &c.map_id, c.image_version, &c.base_slug, &c.source_map),
            score: c.score,
            previous: c.previous,
            players: names(pool, &c.players).await?,
            timestamp: c.timestamp,
        };
        match send(webhook.to_string(), payload(&a, public_url)).await {
            Ok(()) => {
                mark(pool, c.id, true).await?;
                done.posted += 1;
            }
            Err(PostError::Refused(why)) => {
                log::warn!("WR webhook for {} refused the post for run {}: {why}", c.game_name, c.id);
                mark(pool, c.id, false).await?;
            }
            Err(PostError::Retry(why)) => {
                log::warn!("WR webhook for {}: couldn't post run {} yet, trying again later: {why}", c.game_name, c.id);
                break;
            }
        }
        if let Some(id) = c.coop_id {
            coop_done.insert(id);
        }
    }
    Ok(done)
}

/// Whether an error means the tables aren't there yet (the migration hasn't been run).
fn not_set_up(e: &sqlx::Error) -> bool {
    matches!(e, sqlx::Error::Database(d) if matches!(d.code().as_deref(), Some("42P01") | Some("42703")))
}

/// Starts the background announcer.
pub fn start(pool: PgPool, config: Config) {
    tokio::spawn(async move {
        let public_url = config.server.public_url().trim_end_matches('/').to_string();
        let mut warned = false;
        loop {
            tokio::time::sleep(INTERVAL).await;
            match check(&pool, &public_url, |url, body| async move { post(&url, &body).await }).await {
                Ok(Checked { posted, .. }) if posted > 0 => log::info!("WR webhooks: posted {posted} WR(s)"),
                Ok(_) => {}
                Err(e) if not_set_up(&e) => {
                    if !warned {
                        log::warn!("WR webhooks: off until the 20261113000000_wr_webhooks.sql migration is applied");
                        warned = true;
                    }
                    tokio::time::sleep(Duration::from_secs(300)).await;
                }
                Err(e) => log::error!("WR webhooks: check failed: {e}"),
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_discord_webhooks_are_accepted() {
        for ok in [
            "https://discord.com/api/webhooks/123456789012345678/AbC-_x9",
            "https://discordapp.com/api/webhooks/1/t",
            "https://canary.discord.com/api/v10/webhooks/1/t",
        ] {
            assert!(valid_webhook(ok), "{ok}");
        }
        for bad in [
            "http://discord.com/api/webhooks/1/t",
            "https://discord.com.evil.example/api/webhooks/1/t",
            "https://evil.example/api/webhooks/1/t",
            "https://discord.com/api/webhooks/1",
            "https://discord.com/api/webhooks/abc/t",
            "https://discord.com/api/webhooks/1/t/extra",
            "https://discord.com/api/webhooks/1/t?wait=true",
            "https://discord.com:8443/api/webhooks/1/t",
            "https://user@discord.com/api/webhooks/1/t",
            "https://discord.com/api/vx/webhooks/1/t",
            "https://discord.com/api/webhooks/1/t%20x",
            "",
        ] {
            assert!(!valid_webhook(bad), "{bad}");
        }
    }

    #[test]
    fn masks_the_token() {
        assert_eq!(masked("https://discord.com/api/webhooks/123/abcdefghij"), "https://discord.com/api/webhooks/123/…ghij");
        assert_eq!(masked("x"), "…");
    }

    fn wr() -> Announcement {
        Announcement {
            game_id: 2,
            game_name: "Portal Stories: Mel".into(),
            game_has_logo: true,
            map_name: "Tramride".into(),
            mode: "story".into(),
            map_id: "1".into(),
            thumbnail: Some("https://example.test/1.jpg".into()),
            score: 3043,
            previous: Some(3070),
            players: vec![("76561198000000001".into(), "spider_*bot*".into())],
            timestamp: chrono::NaiveDate::from_ymd_opt(2026, 10, 23).and_then(|d| d.and_hms_opt(12, 0, 0)),
        }
    }

    #[test]
    fn payload_matches_the_old_boards_embed() {
        let body = payload(&wr(), "https://boards.example");
        assert_eq!(body["username"], "Portal Stories: Mel");
        assert_eq!(body["avatar_url"], "https://boards.example/api/v1/games/2/images/logo");
        assert_eq!(body["allowed_mentions"], json!({ "parse": [] }));
        let embed = &body["embeds"][0];
        assert_eq!(embed["title"], "Tramride");
        assert_eq!(embed["url"], "https://boards.example/map/story/1");
        assert_eq!(embed["color"], 295077);
        assert_eq!(embed["thumbnail"]["url"], "https://example.test/1.jpg");
        assert_eq!(embed["timestamp"], "2026-10-23T12:00:00+00:00");
        assert_eq!(embed["fields"][0], json!({ "name": "WR", "value": "30.43 (-0.27)", "inline": true }));
        // Markdown in names is shown as typed.
        assert_eq!(embed["fields"][1]["value"], "[spider\\_\\*bot\\*](<https://boards.example/profile/76561198000000001>)");
    }

    #[test]
    fn payload_for_ties_first_times_and_co_op() {
        let tie = payload(&Announcement { previous: Some(3043), ..wr() }, "https://b");
        assert_eq!(tie["embeds"][0]["fields"][0]["value"], "30.43 (tie)");
        let first = payload(&Announcement { previous: None, game_has_logo: false, thumbnail: None, ..wr() }, "https://b");
        assert_eq!(first["embeds"][0]["fields"][0]["value"], "30.43");
        assert!(first.get("avatar_url").is_none() && first["embeds"][0].get("thumbnail").is_none());
        let coop = payload(&Announcement { players: vec![("1".into(), "Blue".into()), ("2".into(), "Orange".into())], ..wr() }, "https://b");
        assert_eq!(coop["embeds"][0]["fields"][1]["value"], "[Blue](<https://b/profile/1>) & [Orange](<https://b/profile/2>)");
    }

    #[test]
    fn thumbnails() {
        assert_eq!(thumbnail("https://b", "s4-52757", Some(9), "portal2", "52757").as_deref(), Some("https://b/api/v1/maps/s4-52757/image?v=9"));
        assert_eq!(
            thumbnail("https://b", "s4-52757", None, "portal2", "52757").as_deref(),
            Some("https://raw.githubusercontent.com/p2sr/Portal2Boards/master/public/images/thumbnails/52757.jpg")
        );
        assert_eq!(thumbnail("https://b", "1", None, "mel", "1").as_deref(), Some("https://raw.githubusercontent.com/NeKzor/board/mel/public/images/thumbnails/1.jpg"));
        assert_eq!(thumbnail("https://b", "x", None, "bexc-is-bald", "x"), None);
    }
}
