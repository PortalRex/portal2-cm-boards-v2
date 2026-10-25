use crate::api::v1::handlers::users::profile_points;
use crate::tools::{config::Config, error::Result, points_cache::PointsCache, ratelimit};
use actix_web::{get, web, HttpRequest, HttpResponse, Responder};
use serde::Deserialize;
use sqlx::PgPool;
use std::time::Duration;

/// The site's colour: the stripe beside the preview in Discord.
const BRAND: &str = "#0775bd";

#[derive(Deserialize)]
pub struct LinkPreviewQuery {
    /// The page's path, when the `X-Original-URI` header (set by nginx) isn't there.
    pub path: Option<String>,
}

/// What a shared link shows.
struct Card {
    site_name: String,
    title: String,
    description: String,
    image: String,
    /// A wide image under the text, or a small one beside it (a player's avatar).
    large_image: bool,
}

/// **GET** The page link previews (Discord, Slack, Twitter, ...) read: a small HTML page with the
/// title, description and image for a path on the site. Their bots don't run the app, so nginx
/// sends them here instead (by user agent); everyone else gets the app. A player's profile shows
/// their name, avatar, places and points; every other page the site's card. Staff-only mode
/// (`SERVER.PRIVATE`) only ever shows the site's card.
///
/// The path is the original request's (`X-Original-URI`), or `?path=`.
///
/// ## Example endpoints:
///  - `/api/v1/link_preview?path=/profile/76561198795823814`
///  - `/api/v1/link_preview?path=/`
///
/// ## Example output (abridged)
///
/// ```html
/// <meta property="og:title" content="i spider">
/// <meta property="og:description" content="19th overall · 15,897 points&#10;28th single player · 13th co-op">
/// <meta property="og:image" content="https://avatars.steamstatic.com/..._full.jpg">
/// ```
#[get("/link_preview")]
async fn link_preview(
    req: HttpRequest,
    config: web::Data<Config>,
    pool: web::Data<PgPool>,
    points_cache: web::Data<PointsCache>,
    query: web::Query<LinkPreviewQuery>,
) -> Result<impl Responder> {
    if let Err(limited) = ratelimit::check(&req, &config, "link_preview", 60, Duration::from_secs(60)) {
        return Ok(limited);
    }
    let original = req.headers().get("x-original-uri").and_then(|v| v.to_str().ok());
    let path = original.or(query.path.as_deref()).unwrap_or("/");
    let path = path.split(['?', '#']).next().unwrap_or("/");
    let base = config.server.public_url().trim_end_matches('/');
    let preview = config.server.read_only();
    let mut card = site_card(base, preview);
    if let Some(profile_number) = profile_in(path).filter(|_| !config.server.private()) {
        if let Some(player) = player_card(pool.get_ref(), points_cache.get_ref(), profile_number, preview).await? {
            card = player;
        }
    }
    let html = page(&card, &format!("{base}{path}"));
    Ok(HttpResponse::Ok().content_type("text/html; charset=utf-8").insert_header(("Cache-Control", "public, max-age=300")).body(html))
}

/// The site's card: the share image, with a PREVIEW tag while the boards are read-only.
fn site_card(base: &str, preview: bool) -> Card {
    let (title, description, image) = if preview {
        (
            "Portal 2 Boards · Preview",
            "The new Portal 2 Challenge Mode leaderboards. Read-only for now. Look around and tell us what you think.",
            "og-image-preview.jpg",
        )
    } else {
        ("Portal 2 Boards", "Portal 2 Challenge Mode leaderboards: world records, score updates, points and player profiles.", "og-image.jpg")
    };
    Card { site_name: "P2CM".into(), title: title.into(), description: description.into(), image: format!("{base}/{image}"), large_image: true }
}

/// A player's card: name, avatar, and their places and points (Portal 2's overall, single player
/// and co-op boards). None for a player we don't know or who's banned.
async fn player_card(pool: &PgPool, points_cache: &PointsCache, profile_number: &str, preview: bool) -> anyhow::Result<Option<Card>> {
    let user: Option<(String, Option<String>, bool)> =
        sqlx::query_as("SELECT COALESCE(NULLIF(board_name, ''), steam_name), avatar, banned FROM users WHERE profile_number = $1")
            .bind(profile_number)
            .fetch_optional(pool)
            .await?;
    let Some((name, Some(avatar), false)) = user else { return Ok(None) };
    let boards = profile_points(pool, points_cache, profile_number).await?;
    let board = |id: i32| boards.iter().find(|b| b.id == id).map(|b| (b.place, b.points.points));
    let site_name = if preview { "Portal 2 Boards · Preview" } else { "Portal 2 Boards" };
    Ok(Some(Card {
        site_name: site_name.into(),
        title: name,
        description: standing(board(-3), board(-1).map(|b| b.0), board(-2).map(|b| b.0)),
        image: avatar,
        large_image: false,
    }))
}

/// "19th overall · 15,897 points", then "28th single player · 13th co-op" (the boards they're on).
fn standing(overall: Option<(i32, f32)>, sp: Option<i32>, coop: Option<i32>) -> String {
    let mut lines = Vec::new();
    if let Some((place, points)) = overall {
        lines.push(format!("{} overall · {} points", ordinal(place), thousands(points.round() as i64)));
    }
    let modes: Vec<String> = [(sp, "single player"), (coop, "co-op")].into_iter().filter_map(|(p, mode)| p.map(|p| format!("{} {mode}", ordinal(p)))).collect();
    if !modes.is_empty() {
        lines.push(modes.join(" · "));
    }
    if lines.is_empty() {
        "No ranked times yet".into()
    } else {
        lines.join("\n")
    }
}

fn ordinal(n: i32) -> String {
    let suffix = match (n % 100, n % 10) {
        (11..=13, _) => "th",
        (_, 1) => "st",
        (_, 2) => "nd",
        (_, 3) => "rd",
        _ => "th",
    };
    format!("{n}{suffix}")
}

fn thousands(n: i64) -> String {
    let digits = n.unsigned_abs().to_string();
    let mut out = String::new();
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(c);
    }
    if n < 0 {
        format!("-{out}")
    } else {
        out
    }
}

/// The player in a profile path (`/profile/{profile_number}`, anything after it ignored).
fn profile_in(path: &str) -> Option<&str> {
    let id = path.strip_prefix("/profile/")?.split('/').next()?;
    (!id.is_empty() && id.len() <= 50 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')).then_some(id)
}

/// Text for an HTML attribute (line breaks kept, as Discord shows them).
fn attr(text: &str) -> String {
    text.replace('&', "&amp;").replace('"', "&quot;").replace('<', "&lt;").replace('>', "&gt;").replace('\n', "&#10;")
}

fn page(card: &Card, url: &str) -> String {
    let (title, description, image, url) = (attr(&card.title), attr(&card.description), attr(&card.image), attr(url));
    let twitter_card = if card.large_image { "summary_large_image" } else { "summary" };
    let size = if card.large_image { "\n<meta property=\"og:image:width\" content=\"1200\">\n<meta property=\"og:image:height\" content=\"630\">" } else { "" };
    format!(
        r#"<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title}</title>
<meta name="description" content="{description}">
<meta name="theme-color" content="{BRAND}">
<meta property="og:site_name" content="{site_name}">
<meta property="og:type" content="website">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:image" content="{image}">{size}
<meta name="twitter:card" content="{twitter_card}">
<link rel="canonical" href="{url}">
</head>
<body><a href="{url}">{title}</a></body>
</html>
"#,
        site_name = attr(&card.site_name),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_places_and_points() {
        assert_eq!(standing(Some((19, 15896.6)), Some(28), Some(13)), "19th overall · 15,897 points\n28th single player · 13th co-op");
        assert_eq!(standing(Some((1, 120.0)), Some(2), None), "1st overall · 120 points\n2nd single player");
        assert_eq!(standing(None, None, None), "No ranked times yet");
        let ords: Vec<String> = [1, 2, 3, 4, 11, 12, 13, 21, 22, 103, 111].into_iter().map(ordinal).collect();
        assert_eq!(ords, ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "103rd", "111th"]);
        assert_eq!((thousands(0), thousands(999), thousands(1000), thousands(1234567)), ("0".into(), "999".into(), "1,000".into(), "1,234,567".into()));
    }

    #[test]
    fn finds_the_player_in_a_profile_path() {
        assert_eq!(profile_in("/profile/76561198795823814"), Some("76561198795823814"));
        assert_eq!(profile_in("/profile/76561198795823814/stats"), Some("76561198795823814"));
        assert_eq!(profile_in("/profile/"), None);
        assert_eq!(profile_in("/profile/a\"b"), None);
        assert_eq!(profile_in("/map/sp/47756"), None);
    }

    #[test]
    fn escapes_what_players_can_set() {
        let card = Card {
            site_name: "P2CM".into(),
            title: "<b>\"x\" & y</b>".into(),
            description: "one\ntwo".into(),
            image: "https://example.test/a.jpg".into(),
            large_image: false,
        };
        let html = page(&card, "https://example.test/profile/1");
        assert!(html.contains(r#"<meta property="og:title" content="&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;">"#), "{html}");
        assert!(html.contains(r#"content="one&#10;two""#));
        assert!(html.contains(r#"<meta name="twitter:card" content="summary">"#));
        assert!(!html.contains("og:image:width"), "a small image has no size");
        assert!(!html.contains("<b>"));
    }

    #[test]
    fn the_site_card_says_preview_while_read_only() {
        let card = site_card("https://preview.portal2.sr", true);
        assert_eq!((card.title.as_str(), card.image.as_str()), ("Portal 2 Boards · Preview", "https://preview.portal2.sr/og-image-preview.jpg"));
        let card = site_card("https://board.portal2.sr", false);
        assert_eq!((card.title.as_str(), card.image.as_str()), ("Portal 2 Boards", "https://board.portal2.sr/og-image.jpg"));
        let html = page(&card, "https://board.portal2.sr/");
        assert!(html.contains(r#"<meta name="twitter:card" content="summary_large_image">"#) && html.contains(r#"content="1200""#));
    }
}
