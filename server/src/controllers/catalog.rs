//! Games, seasons, chapters, maps and categories, and the admin editor for them.
//!
//! Maps (leaderboards) can be linked: a run set on one is also recorded on the other when it
//! beats the player's best there (database triggers, see the `games_seasons` migration). Linking
//! doesn't copy existing times. A season is a game whose maps are copies of a base game's maps
//! (`maps.source_map`), normally linked to them; links to a season only apply inside its dates.
use crate::{
    controllers::moderation::{log_action, ActionResult, Refused, FILLER},
    tools::auth::AdminOrService,
};
use chrono::NaiveDateTime;
use serde_json::json;
use sqlx::{FromRow, PgPool, Postgres, Transaction};

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct CatalogGame {
    pub id: i32,
    pub name: String,
    pub slug: String,
    pub kind: String,
    pub base_game_id: Option<i32>,
    pub starts_at: Option<NaiveDateTime>,
    pub ends_at: Option<NaiveDateTime>,
    pub sort_order: i32,
    pub hidden: bool,
    #[sqlx(skip)]
    pub chapters: Vec<CatalogChapter>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct CatalogChapter {
    pub id: i32,
    #[serde(skip)]
    pub game_id: i32,
    pub name: Option<String>,
    pub game_mode: String,
    pub is_multiplayer: bool,
    pub sort_order: i32,
    #[sqlx(skip)]
    pub maps: Vec<CatalogMap>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct CatalogMap {
    pub steam_id: String,
    #[serde(skip)]
    pub chapter_id: Option<i32>,
    pub name: String,
    pub bsp_name: Option<String>,
    pub default_cat_id: Option<i32>,
    pub source_map: Option<String>,
    pub sort_order: i32,
    /// When an uploaded image was set (seconds since 1970), if the map has one: it's served at
    /// `/maps/{steam_id}/image?v={image_version}`.
    pub image_version: Option<i64>,
    #[sqlx(skip)]
    pub categories: Vec<CatalogCategory>,
    /// Maps linked to this one.
    #[sqlx(skip)]
    pub links: Vec<String>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct CatalogCategory {
    pub id: i32,
    #[serde(skip)]
    pub map_id: String,
    pub name: String,
}

/// Every game with its chapters, maps and categories, in display order. Hidden games only
/// when `include_hidden` (staff).
pub async fn catalog(pool: &PgPool, include_hidden: bool) -> Result<Vec<CatalogGame>, sqlx::Error> {
    let mut games = sqlx::query_as::<_, CatalogGame>(
        "SELECT id, game_name AS name, slug, kind, base_game_id, starts_at, ends_at, sort_order, hidden FROM games WHERE $1 OR NOT hidden ORDER BY sort_order, id",
    )
    .bind(include_hidden)
    .fetch_all(pool)
    .await?;
    let chapters = sqlx::query_as::<_, CatalogChapter>("SELECT id, game_id, chapter_name AS name, game_mode, is_multiplayer, sort_order FROM chapters ORDER BY sort_order, id")
        .fetch_all(pool)
        .await?;
    let maps = sqlx::query_as::<_, CatalogMap>(
        "SELECT steam_id, chapter_id, name, bsp_name, default_cat_id, source_map, sort_order, CASE WHEN image_file IS NOT NULL THEN extract(epoch FROM image_updated)::bigint END AS image_version FROM maps ORDER BY sort_order, id",
    )
        .fetch_all(pool)
        .await?;
    let categories = sqlx::query_as::<_, CatalogCategory>("SELECT id, map_id, name FROM categories ORDER BY id").fetch_all(pool).await?;
    let links: Vec<(String, String)> = sqlx::query_as("SELECT map_a, map_b FROM map_links").fetch_all(pool).await?;
    for game in games.iter_mut() {
        game.chapters = chapters
            .iter()
            .filter(|c| c.game_id == game.id)
            .map(|c| {
                let mut c = c.clone();
                c.maps = maps
                    .iter()
                    .filter(|m| m.chapter_id == Some(c.id))
                    .map(|m| {
                        let mut m = m.clone();
                        m.categories = categories.iter().filter(|k| k.map_id == m.steam_id).cloned().collect();
                        m.links = links
                            .iter()
                            .filter_map(|(a, b)| if *a == m.steam_id { Some(b.clone()) } else if *b == m.steam_id { Some(a.clone()) } else { None })
                            .collect();
                        m
                    })
                    .collect();
                c
            })
            .collect();
    }
    Ok(games)
}

fn valid_slug(slug: &str) -> bool {
    (2..=32).contains(&slug.len()) && slug.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') && !slug.starts_with('-')
}

fn valid_mode(mode: &str) -> bool {
    (1..=20).contains(&mode.len()) && mode.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

fn clean_name(name: &str, max: usize) -> Result<String, Refused> {
    let name = name.trim();
    if name.is_empty() {
        return Err(Refused::Invalid("Enter a name.".into()));
    }
    if name.chars().count() > max {
        return Err(Refused::Invalid(format!("Names can be at most {max} characters.")));
    }
    Ok(name.to_string())
}

macro_rules! check {
    ($e:expr) => {
        match $e {
            Ok(v) => v,
            Err(refused) => return Ok(Err(refused)),
        }
    };
}

pub struct NewGame<'a> {
    pub name: &'a str,
    pub slug: &'a str,
    /// Set for a season: the game whose map pool it copies.
    pub base_game_id: Option<i32>,
    pub starts_at: Option<NaiveDateTime>,
    pub ends_at: Option<NaiveDateTime>,
    /// Season: link each copied map to its original, so new runs count on both.
    pub link_to_base: bool,
}

/// Creates a game, or a season (copying its base game's chapters, maps and default categories,
/// linked to the originals unless asked not to). Returns the new game id.
pub async fn create_game(pool: &PgPool, actor: &AdminOrService, new: NewGame<'_>) -> ActionResult<i32> {
    let name = check!(clean_name(new.name, 80));
    if !valid_slug(new.slug) {
        return Ok(Err(Refused::Invalid("The link name can use lowercase letters, digits and dashes (2-32 characters).".into())));
    }
    let mut tx = pool.begin().await?;
    if sqlx::query_scalar::<_, i32>("SELECT id FROM games WHERE slug = $1").bind(new.slug).fetch_optional(&mut *tx).await?.is_some() {
        return Ok(Err(Refused::Invalid("Another game already uses that link name.".into())));
    }
    let season = new.base_game_id.is_some();
    if season {
        match (new.starts_at, new.ends_at) {
            (None, _) => return Ok(Err(Refused::Invalid("A season needs a start date.".into()))),
            (Some(s), Some(e)) if e <= s => return Ok(Err(Refused::Invalid("The season must end after it starts.".into()))),
            _ => {}
        }
    }
    let order: i32 = sqlx::query_scalar("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM games").fetch_one(&mut *tx).await?;
    let id: i32 = sqlx::query_scalar(
        "INSERT INTO games (game_name, slug, kind, base_game_id, starts_at, ends_at, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
    )
    .bind(&name)
    .bind(new.slug)
    .bind(if season { "season" } else { "game" })
    .bind(new.base_game_id)
    .bind(new.starts_at)
    .bind(new.ends_at)
    .bind(order)
    .fetch_one(&mut *tx)
    .await?;
    let mut copied = 0;
    if let Some(base) = new.base_game_id {
        copied = check!(copy_pool(&mut tx, base, id).await?);
        if new.link_to_base {
            sqlx::query(
                r#"
                    INSERT INTO map_links (map_a, map_b)
                    SELECT LEAST(m.steam_id, m.source_map), GREATEST(m.steam_id, m.source_map)
                    FROM maps AS m JOIN chapters AS c ON c.id = m.chapter_id
                    WHERE c.game_id = $1 AND m.source_map IS NOT NULL
                    ON CONFLICT DO NOTHING
                "#,
            )
            .bind(id)
            .execute(&mut *tx)
            .await?;
        }
    }
    log_action(
        &mut tx,
        actor,
        if season { "season.create" } else { "game.create" },
        "game",
        &id.to_string(),
        None,
        json!({ "name": name, "slug": new.slug, "base_game_id": new.base_game_id, "starts_at": new.starts_at, "ends_at": new.ends_at, "maps": copied, "linked_to_base": season && new.link_to_base }),
    )
    .await?;
    tx.commit().await?;
    Ok(Ok(id))
}

/// Copies a game's chapters, maps and default categories into a season, with a placeholder
/// run on each co-op map for unpaired runs. Returns the number of maps copied.
async fn copy_pool(tx: &mut Transaction<'_, Postgres>, base: i32, season: i32) -> Result<Result<usize, Refused>, sqlx::Error> {
    let base_kind: Option<String> = sqlx::query_scalar("SELECT kind FROM games WHERE id = $1").bind(base).fetch_optional(&mut **tx).await?;
    match base_kind.as_deref() {
        None => return Ok(Err(Refused::NotFound("No such base game."))),
        Some("season") => return Ok(Err(Refused::Invalid("A season has to copy a game, not another season.".into()))),
        _ => {}
    }
    let chapters: Vec<(i32, Option<String>, bool, String, i32)> =
        sqlx::query_as("SELECT id, chapter_name, is_multiplayer, game_mode, sort_order FROM chapters WHERE game_id = $1 ORDER BY sort_order, id")
            .bind(base)
            .fetch_all(&mut **tx)
            .await?;
    let mut copied = 0;
    for (chapter_id, name, multi, mode, order) in chapters {
        let new_chapter: i32 =
            sqlx::query_scalar("INSERT INTO chapters (chapter_name, is_multiplayer, game_id, game_mode, sort_order) VALUES ($1, $2, $3, $4, $5) RETURNING id")
                .bind(&name)
                .bind(multi)
                .bind(season)
                .bind(&mode)
                .bind(order)
                .fetch_one(&mut **tx)
                .await?;
        let maps: Vec<(String, String, Option<String>, Option<i32>, i32)> =
            sqlx::query_as("SELECT steam_id, name, bsp_name, default_cat_id, sort_order FROM maps WHERE chapter_id = $1 ORDER BY sort_order, id")
                .bind(chapter_id)
                .fetch_all(&mut **tx)
                .await?;
        for (steam_id, map_name, bsp, default_cat, map_order) in maps {
            let new_id = format!("s{season}-{steam_id}");
            sqlx::query("INSERT INTO maps (steam_id, lp_id, name, chapter_id, is_public, bsp_name, sort_order, source_map) VALUES ($1, '', $2, $3, false, $4, $5, $6)")
                .bind(&new_id)
                .bind(&map_name)
                .bind(new_chapter)
                .bind(&bsp)
                .bind(map_order)
                .bind(&steam_id)
                .execute(&mut **tx)
                .await?;
            let category: Option<(String, Option<i32>)> = match default_cat {
                Some(cat) => sqlx::query_as("SELECT name, rules_id FROM categories WHERE id = $1").bind(cat).fetch_optional(&mut **tx).await?,
                None => None,
            };
            let (cat_name, rules) = category.unwrap_or_else(|| ("any%".to_string(), None));
            let new_cat: i32 = sqlx::query_scalar("INSERT INTO categories (name, map_id, rules_id) VALUES ($1, $2, $3) RETURNING id")
                .bind(&cat_name)
                .bind(&new_id)
                .bind(rules)
                .fetch_one(&mut **tx)
                .await?;
            sqlx::query("UPDATE maps SET default_cat_id = $2 WHERE steam_id = $1").bind(&new_id).bind(new_cat).execute(&mut **tx).await?;
            if multi {
                add_filler(tx, &new_id, new_cat).await?;
            }
            copied += 1;
        }
    }
    Ok(Ok(copied))
}

/// The placeholder ("N/A") run unpaired co-op runs are bundled with.
async fn add_filler(tx: &mut Transaction<'_, Postgres>, map_id: &str, category: i32) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
            INSERT INTO changelog (timestamp, profile_number, score, map_id, banned, submission, category_id, verified)
            VALUES (TIMESTAMP '2000-01-01', $1, 0, $2, false, 0, $3, true)
        "#,
    )
    .bind(FILLER)
    .bind(map_id)
    .bind(category)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub struct GameUpdate<'a> {
    pub name: Option<&'a str>,
    pub slug: Option<&'a str>,
    pub starts_at: Option<Option<NaiveDateTime>>,
    pub ends_at: Option<Option<NaiveDateTime>>,
    pub hidden: Option<bool>,
}

/// Renames a game, changes its link name or visibility, or moves a season's dates (which only
/// affects runs set from then on).
pub async fn update_game(pool: &PgPool, actor: &AdminOrService, id: i32, update: GameUpdate<'_>) -> ActionResult<()> {
    let mut tx = pool.begin().await?;
    let current: Option<(String, String, Option<NaiveDateTime>, Option<NaiveDateTime>)> =
        sqlx::query_as("SELECT game_name, kind, starts_at, ends_at FROM games WHERE id = $1 FOR UPDATE").bind(id).fetch_optional(&mut *tx).await?;
    let Some((_, kind, starts, ends)) = current else {
        return Ok(Err(Refused::NotFound("No such game.")));
    };
    if let Some(name) = update.name {
        let name = check!(clean_name(name, 80));
        sqlx::query("UPDATE games SET game_name = $2 WHERE id = $1").bind(id).bind(name).execute(&mut *tx).await?;
    }
    if let Some(slug) = update.slug {
        if !valid_slug(slug) {
            return Ok(Err(Refused::Invalid("The link name can use lowercase letters, digits and dashes (2-32 characters).".into())));
        }
        if sqlx::query_scalar::<_, i32>("SELECT id FROM games WHERE slug = $1 AND id <> $2").bind(slug).bind(id).fetch_optional(&mut *tx).await?.is_some() {
            return Ok(Err(Refused::Invalid("Another game already uses that link name.".into())));
        }
        sqlx::query("UPDATE games SET slug = $2 WHERE id = $1").bind(id).bind(slug).execute(&mut *tx).await?;
    }
    if let Some(hidden) = update.hidden {
        sqlx::query("UPDATE games SET hidden = $2 WHERE id = $1").bind(id).bind(hidden).execute(&mut *tx).await?;
    }
    let new_starts = update.starts_at.unwrap_or(starts);
    let new_ends = update.ends_at.unwrap_or(ends);
    let window_moved = new_starts != starts || new_ends != ends;
    if window_moved {
        if kind != "season" {
            return Ok(Err(Refused::Invalid("Only seasons have dates.".into())));
        }
        match (new_starts, new_ends) {
            (None, _) => return Ok(Err(Refused::Invalid("A season needs a start date.".into()))),
            (Some(s), Some(e)) if e <= s => return Ok(Err(Refused::Invalid("The season must end after it starts.".into()))),
            _ => {}
        }
        sqlx::query("UPDATE games SET starts_at = $2, ends_at = $3 WHERE id = $1").bind(id).bind(new_starts).bind(new_ends).execute(&mut *tx).await?;
    }
    log_action(
        &mut tx,
        actor,
        "game.update",
        "game",
        &id.to_string(),
        None,
        json!({ "name": update.name, "slug": update.slug, "hidden": update.hidden, "starts_at": new_starts, "ends_at": new_ends, "window_moved": window_moved }),
    )
    .await?;
    tx.commit().await?;
    Ok(Ok(()))
}

/// Deletes a game. Refused while it has runs of its own (a season's mirrored runs go with it).
pub async fn delete_game(pool: &PgPool, actor: &AdminOrService, id: i32) -> ActionResult<()> {
    if id <= 2 {
        return Ok(Err(Refused::Invalid("Portal 2 and Portal Stories: Mel can't be deleted.".into())));
    }
    let mut tx = pool.begin().await?;
    let name: Option<String> = sqlx::query_scalar("SELECT game_name FROM games WHERE id = $1 FOR UPDATE").bind(id).fetch_optional(&mut *tx).await?;
    let Some(name) = name else {
        return Ok(Err(Refused::NotFound("No such game.")));
    };
    if sqlx::query_scalar::<_, i32>("SELECT id FROM games WHERE base_game_id = $1 LIMIT 1").bind(id).fetch_optional(&mut *tx).await?.is_some() {
        return Ok(Err(Refused::Invalid("Seasons are based on this game; delete them first.".into())));
    }
    let own_runs: i64 = sqlx::query_scalar(
        r#"
            SELECT COUNT(*) FROM changelog AS x JOIN maps AS m ON m.steam_id = x.map_id JOIN chapters AS c ON c.id = m.chapter_id
            WHERE c.game_id = $1 AND x.mirror_of IS NULL AND x.profile_number <> $2
        "#,
    )
    .bind(id)
    .bind(FILLER)
    .fetch_one(&mut *tx)
    .await?;
    if own_runs > 0 {
        return Ok(Err(Refused::Invalid(format!("This game has {own_runs} runs of its own, so it can't be deleted. Hide it instead."))));
    }
    sqlx::query("SELECT season_clear($1)").bind(id).execute(&mut *tx).await?;
    sqlx::query(
        r#"
            DELETE FROM coop_bundled WHERE cl_id1 IN (SELECT x.id FROM changelog AS x JOIN maps AS m ON m.steam_id = x.map_id JOIN chapters AS c ON c.id = m.chapter_id WHERE c.game_id = $1)
                OR cl_id2 IN (SELECT x.id FROM changelog AS x JOIN maps AS m ON m.steam_id = x.map_id JOIN chapters AS c ON c.id = m.chapter_id WHERE c.game_id = $1)
        "#,
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;
    sqlx::query("DELETE FROM changelog WHERE map_id IN (SELECT m.steam_id FROM maps AS m JOIN chapters AS c ON c.id = m.chapter_id WHERE c.game_id = $1)")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE maps SET default_cat_id = NULL WHERE chapter_id IN (SELECT id FROM chapters WHERE game_id = $1)").bind(id).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM categories WHERE map_id IN (SELECT m.steam_id FROM maps AS m JOIN chapters AS c ON c.id = m.chapter_id WHERE c.game_id = $1)")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM mtriggers WHERE map_id IN (SELECT m.steam_id FROM maps AS m JOIN chapters AS c ON c.id = m.chapter_id WHERE c.game_id = $1)")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM maps WHERE chapter_id IN (SELECT id FROM chapters WHERE game_id = $1)").bind(id).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM chapters WHERE game_id = $1").bind(id).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM games WHERE id = $1").bind(id).execute(&mut *tx).await?;
    log_action(&mut tx, actor, "game.delete", "game", &id.to_string(), None, json!({ "name": name })).await?;
    tx.commit().await?;
    Ok(Ok(()))
}

/// Seasons follow their base game's map pool; editing it happens on the base game.
async fn editable_game(tx: &mut Transaction<'_, Postgres>, game_id: i32) -> Result<Result<(), Refused>, sqlx::Error> {
    let kind: Option<String> = sqlx::query_scalar("SELECT kind FROM games WHERE id = $1").bind(game_id).fetch_optional(&mut **tx).await?;
    Ok(match kind.as_deref() {
        None => Err(Refused::NotFound("No such game.")),
        Some("season") => Err(Refused::Invalid("A season's map pool is copied from its base game and can't be edited.".into())),
        _ => Ok(()),
    })
}

async fn chapter_game(tx: &mut Transaction<'_, Postgres>, chapter_id: i32) -> Result<Option<i32>, sqlx::Error> {
    sqlx::query_scalar("SELECT game_id FROM chapters WHERE id = $1").bind(chapter_id).fetch_optional(&mut **tx).await
}

async fn map_game(tx: &mut Transaction<'_, Postgres>, steam_id: &str) -> Result<Option<i32>, sqlx::Error> {
    sqlx::query_scalar("SELECT c.game_id FROM maps AS m JOIN chapters AS c ON c.id = m.chapter_id WHERE m.steam_id = $1")
        .bind(steam_id)
        .fetch_optional(&mut **tx)
        .await
}

pub async fn create_chapter(pool: &PgPool, actor: &AdminOrService, game_id: i32, name: &str, mode: &str, multiplayer: bool) -> ActionResult<i32> {
    let name = check!(clean_name(name, 50));
    if !valid_mode(mode) {
        return Ok(Err(Refused::Invalid("The board key can use lowercase letters, digits and underscores (e.g. sp, coop).".into())));
    }
    let mut tx = pool.begin().await?;
    check!(editable_game(&mut tx, game_id).await?);
    let order: i32 = sqlx::query_scalar("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM chapters").fetch_one(&mut *tx).await?;
    let id: i32 = sqlx::query_scalar("INSERT INTO chapters (chapter_name, is_multiplayer, game_id, game_mode, sort_order) VALUES ($1, $2, $3, $4, $5) RETURNING id")
        .bind(&name)
        .bind(multiplayer)
        .bind(game_id)
        .bind(mode)
        .bind(order)
        .fetch_one(&mut *tx)
        .await?;
    log_action(&mut tx, actor, "chapter.create", "chapter", &id.to_string(), None, json!({ "game_id": game_id, "name": name, "game_mode": mode, "is_multiplayer": multiplayer })).await?;
    tx.commit().await?;
    Ok(Ok(id))
}

pub async fn update_chapter(pool: &PgPool, actor: &AdminOrService, id: i32, name: Option<&str>, mode: Option<&str>) -> ActionResult<()> {
    let mut tx = pool.begin().await?;
    let Some(game_id) = chapter_game(&mut tx, id).await? else {
        return Ok(Err(Refused::NotFound("No such chapter.")));
    };
    check!(editable_game(&mut tx, game_id).await?);
    if let Some(name) = name {
        let name = check!(clean_name(name, 50));
        sqlx::query("UPDATE chapters SET chapter_name = $2 WHERE id = $1").bind(id).bind(name).execute(&mut *tx).await?;
    }
    if let Some(mode) = mode {
        if !valid_mode(mode) {
            return Ok(Err(Refused::Invalid("The board key can use lowercase letters, digits and underscores (e.g. sp, coop).".into())));
        }
        sqlx::query("UPDATE chapters SET game_mode = $2 WHERE id = $1").bind(id).bind(mode).execute(&mut *tx).await?;
    }
    log_action(&mut tx, actor, "chapter.update", "chapter", &id.to_string(), None, json!({ "name": name, "game_mode": mode })).await?;
    tx.commit().await?;
    Ok(Ok(()))
}

pub async fn delete_chapter(pool: &PgPool, actor: &AdminOrService, id: i32) -> ActionResult<()> {
    let mut tx = pool.begin().await?;
    let Some(game_id) = chapter_game(&mut tx, id).await? else {
        return Ok(Err(Refused::NotFound("No such chapter.")));
    };
    check!(editable_game(&mut tx, game_id).await?);
    if sqlx::query_scalar::<_, i32>("SELECT id FROM maps WHERE chapter_id = $1 LIMIT 1").bind(id).fetch_optional(&mut *tx).await?.is_some() {
        return Ok(Err(Refused::Invalid("Move or delete this chapter's maps first.".into())));
    }
    sqlx::query("DELETE FROM chapters WHERE id = $1").bind(id).execute(&mut *tx).await?;
    log_action(&mut tx, actor, "chapter.delete", "chapter", &id.to_string(), None, json!({ "game_id": game_id })).await?;
    tx.commit().await?;
    Ok(Ok(()))
}

pub struct NewMap<'a> {
    pub name: &'a str,
    /// The Steam leaderboard id, if the map has one; otherwise one is made up.
    pub steam_id: Option<&'a str>,
    pub bsp_name: Option<&'a str>,
    pub category: Option<&'a str>,
}

/// Adds a map (with its default category) to a chapter. Returns the map id.
pub async fn create_map(pool: &PgPool, actor: &AdminOrService, chapter_id: i32, new: NewMap<'_>) -> ActionResult<String> {
    let name = check!(clean_name(new.name, 50));
    let mut tx = pool.begin().await?;
    let chapter: Option<(i32, bool)> = sqlx::query_as("SELECT game_id, is_multiplayer FROM chapters WHERE id = $1").bind(chapter_id).fetch_optional(&mut *tx).await?;
    let Some((game_id, multi)) = chapter else {
        return Ok(Err(Refused::NotFound("No such chapter.")));
    };
    check!(editable_game(&mut tx, game_id).await?);
    let steam_id = match new.steam_id.map(str::trim).filter(|s| !s.is_empty()) {
        Some(id) if id.len() <= 32 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') => id.to_string(),
        Some(_) => return Ok(Err(Refused::Invalid("Map ids can use letters, digits, dashes and underscores (up to 32).".into()))),
        None => {
            let n: i64 = sqlx::query_scalar("SELECT COUNT(*) + 1 FROM maps AS m JOIN chapters AS c ON c.id = m.chapter_id WHERE c.game_id = $1").bind(game_id).fetch_one(&mut *tx).await?;
            let mut id = format!("g{game_id}-{n}");
            let mut k = n;
            while sqlx::query_scalar::<_, i32>("SELECT id FROM maps WHERE steam_id = $1").bind(&id).fetch_optional(&mut *tx).await?.is_some() {
                k += 1;
                id = format!("g{game_id}-{k}");
            }
            id
        }
    };
    if sqlx::query_scalar::<_, i32>("SELECT id FROM maps WHERE steam_id = $1").bind(&steam_id).fetch_optional(&mut *tx).await?.is_some() {
        return Ok(Err(Refused::Invalid("Another map already has that id.".into())));
    }
    let bsp = new.bsp_name.map(str::trim).filter(|s| !s.is_empty());
    let order: i32 = sqlx::query_scalar("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM maps").fetch_one(&mut *tx).await?;
    sqlx::query("INSERT INTO maps (steam_id, lp_id, name, chapter_id, is_public, bsp_name, sort_order) VALUES ($1, '', $2, $3, false, $4, $5)")
        .bind(&steam_id)
        .bind(&name)
        .bind(chapter_id)
        .bind(bsp)
        .bind(order)
        .execute(&mut *tx)
        .await?;
    let cat_name = check!(clean_name(new.category.unwrap_or("any%"), 100));
    let cat: i32 = sqlx::query_scalar("INSERT INTO categories (name, map_id) VALUES ($1, $2) RETURNING id").bind(&cat_name).bind(&steam_id).fetch_one(&mut *tx).await?;
    sqlx::query("UPDATE maps SET default_cat_id = $2 WHERE steam_id = $1").bind(&steam_id).bind(cat).execute(&mut *tx).await?;
    if multi {
        add_filler(&mut tx, &steam_id, cat).await?;
    }
    log_action(&mut tx, actor, "map.create", "map", &steam_id, None, json!({ "chapter_id": chapter_id, "name": name, "bsp_name": bsp, "category": cat_name })).await?;
    tx.commit().await?;
    Ok(Ok(steam_id))
}

pub async fn update_map(pool: &PgPool, actor: &AdminOrService, steam_id: &str, name: Option<&str>, bsp_name: Option<Option<&str>>, default_cat: Option<i32>) -> ActionResult<()> {
    let mut tx = pool.begin().await?;
    let Some(game_id) = map_game(&mut tx, steam_id).await? else {
        return Ok(Err(Refused::NotFound("No such map.")));
    };
    check!(editable_game(&mut tx, game_id).await?);
    if let Some(name) = name {
        let name = check!(clean_name(name, 50));
        sqlx::query("UPDATE maps SET name = $2 WHERE steam_id = $1").bind(steam_id).bind(&name).execute(&mut *tx).await?;
        // Season copies keep the original's name.
        sqlx::query("UPDATE maps SET name = $2 WHERE source_map = $1").bind(steam_id).bind(&name).execute(&mut *tx).await?;
    }
    if let Some(bsp) = bsp_name {
        let bsp = bsp.map(str::trim).filter(|s| !s.is_empty());
        sqlx::query("UPDATE maps SET bsp_name = $2 WHERE steam_id = $1 OR source_map = $1").bind(steam_id).bind(bsp).execute(&mut *tx).await?;
    }
    if let Some(cat) = default_cat {
        if sqlx::query_scalar::<_, i32>("SELECT id FROM categories WHERE id = $1 AND map_id = $2").bind(cat).bind(steam_id).fetch_optional(&mut *tx).await?.is_none() {
            return Ok(Err(Refused::Invalid("That category isn't on this map.".into())));
        }
        sqlx::query("UPDATE maps SET default_cat_id = $2 WHERE steam_id = $1").bind(steam_id).bind(cat).execute(&mut *tx).await?;
    }
    log_action(&mut tx, actor, "map.update", "map", steam_id, None, json!({ "name": name, "bsp_name": bsp_name, "default_cat_id": default_cat })).await?;
    tx.commit().await?;
    Ok(Ok(()))
}

pub async fn delete_map(pool: &PgPool, actor: &AdminOrService, steam_id: &str) -> ActionResult<()> {
    let mut tx = pool.begin().await?;
    let Some(game_id) = map_game(&mut tx, steam_id).await? else {
        return Ok(Err(Refused::NotFound("No such map.")));
    };
    check!(editable_game(&mut tx, game_id).await?);
    let runs: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM changelog WHERE map_id = $1 AND profile_number <> $2").bind(steam_id).bind(FILLER).fetch_one(&mut *tx).await?;
    if runs > 0 {
        return Ok(Err(Refused::Invalid(format!("This map has {runs} runs, so it can't be deleted."))));
    }
    if sqlx::query_scalar::<_, String>("SELECT steam_id FROM maps WHERE source_map = $1 LIMIT 1").bind(steam_id).fetch_optional(&mut *tx).await?.is_some() {
        return Ok(Err(Refused::Invalid("A season uses this map.".into())));
    }
    sqlx::query("DELETE FROM coop_bundled WHERE cl_id1 IN (SELECT id FROM changelog WHERE map_id = $1) OR cl_id2 IN (SELECT id FROM changelog WHERE map_id = $1)")
        .bind(steam_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM changelog WHERE map_id = $1").bind(steam_id).execute(&mut *tx).await?;
    sqlx::query("UPDATE maps SET default_cat_id = NULL WHERE steam_id = $1").bind(steam_id).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM categories WHERE map_id = $1").bind(steam_id).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM mtriggers WHERE map_id = $1").bind(steam_id).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM maps WHERE steam_id = $1").bind(steam_id).execute(&mut *tx).await?;
    log_action(&mut tx, actor, "map.delete", "map", steam_id, None, json!({ "game_id": game_id })).await?;
    tx.commit().await?;
    Ok(Ok(()))
}

pub async fn create_category(pool: &PgPool, actor: &AdminOrService, steam_id: &str, name: &str) -> ActionResult<i32> {
    let name = check!(clean_name(name, 100));
    let mut tx = pool.begin().await?;
    let Some(game_id) = map_game(&mut tx, steam_id).await? else {
        return Ok(Err(Refused::NotFound("No such map.")));
    };
    check!(editable_game(&mut tx, game_id).await?);
    let id: i32 = sqlx::query_scalar("INSERT INTO categories (name, map_id) VALUES ($1, $2) RETURNING id").bind(&name).bind(steam_id).fetch_one(&mut *tx).await?;
    log_action(&mut tx, actor, "category.create", "category", &id.to_string(), None, json!({ "map_id": steam_id, "name": name })).await?;
    tx.commit().await?;
    Ok(Ok(id))
}

pub async fn update_category(pool: &PgPool, actor: &AdminOrService, id: i32, name: &str) -> ActionResult<()> {
    let name = check!(clean_name(name, 100));
    let mut tx = pool.begin().await?;
    let map: Option<String> = sqlx::query_scalar("SELECT map_id FROM categories WHERE id = $1").bind(id).fetch_optional(&mut *tx).await?;
    let Some(map) = map else {
        return Ok(Err(Refused::NotFound("No such category.")));
    };
    if let Some(game_id) = map_game(&mut tx, &map).await? {
        check!(editable_game(&mut tx, game_id).await?);
    }
    sqlx::query("UPDATE categories SET name = $2 WHERE id = $1").bind(id).bind(&name).execute(&mut *tx).await?;
    log_action(&mut tx, actor, "category.update", "category", &id.to_string(), None, json!({ "map_id": map, "name": name })).await?;
    tx.commit().await?;
    Ok(Ok(()))
}

pub async fn delete_category(pool: &PgPool, actor: &AdminOrService, id: i32) -> ActionResult<()> {
    let mut tx = pool.begin().await?;
    let row: Option<(String, Option<i32>)> =
        sqlx::query_as("SELECT k.map_id, m.default_cat_id FROM categories AS k JOIN maps AS m ON m.steam_id = k.map_id WHERE k.id = $1").bind(id).fetch_optional(&mut *tx).await?;
    let Some((map, default_cat)) = row else {
        return Ok(Err(Refused::NotFound("No such category.")));
    };
    if let Some(game_id) = map_game(&mut tx, &map).await? {
        check!(editable_game(&mut tx, game_id).await?);
    }
    if default_cat == Some(id) {
        return Ok(Err(Refused::Invalid("That's the map's main category; make another one the main category first.".into())));
    }
    let runs: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM changelog WHERE category_id = $1").bind(id).fetch_one(&mut *tx).await?;
    if runs > 0 {
        return Ok(Err(Refused::Invalid(format!("This category has {runs} runs, so it can't be deleted."))));
    }
    sqlx::query("DELETE FROM categories WHERE id = $1").bind(id).execute(&mut *tx).await?;
    log_action(&mut tx, actor, "category.delete", "category", &id.to_string(), None, json!({ "map_id": map })).await?;
    tx.commit().await?;
    Ok(Ok(()))
}

/// A map's game and whether it's co-op.
async fn map_kind(tx: &mut Transaction<'_, Postgres>, steam_id: &str) -> Result<Option<(i32, bool)>, sqlx::Error> {
    sqlx::query_as("SELECT c.game_id, c.is_multiplayer FROM maps AS m JOIN chapters AS c ON c.id = m.chapter_id WHERE m.steam_id = $1")
        .bind(steam_id)
        .fetch_optional(&mut **tx)
        .await
}

/// Links two maps of different games: from now on a run on either is also evaluated for the
/// other. Existing times aren't copied.
pub async fn link_maps(pool: &PgPool, actor: &AdminOrService, a: &str, b: &str) -> ActionResult<()> {
    let mut tx = pool.begin().await?;
    let (Some((game_a, multi_a)), Some((game_b, multi_b))) = (map_kind(&mut tx, a).await?, map_kind(&mut tx, b).await?) else {
        return Ok(Err(Refused::NotFound("No such map.")));
    };
    if game_a == game_b {
        return Ok(Err(Refused::Invalid("Linked maps have to be in different games or seasons.".into())));
    }
    if multi_a != multi_b {
        return Ok(Err(Refused::Invalid("A singleplayer map can't be linked to a co-op map.".into())));
    }
    let (lo, hi) = if a < b { (a, b) } else { (b, a) };
    let added = sqlx::query("INSERT INTO map_links (map_a, map_b) VALUES ($1, $2) ON CONFLICT DO NOTHING").bind(lo).bind(hi).execute(&mut *tx).await?;
    if added.rows_affected() == 0 {
        return Ok(Err(Refused::Invalid("Those maps are already linked.".into())));
    }
    log_action(&mut tx, actor, "map.link", "map", a, None, json!({ "linked_to": b })).await?;
    tx.commit().await?;
    Ok(Ok(()))
}

pub async fn unlink_maps(pool: &PgPool, actor: &AdminOrService, a: &str, b: &str) -> ActionResult<()> {
    let mut tx = pool.begin().await?;
    let (lo, hi) = if a < b { (a, b) } else { (b, a) };
    let removed = sqlx::query("DELETE FROM map_links WHERE map_a = $1 AND map_b = $2").bind(lo).bind(hi).execute(&mut *tx).await?;
    if removed.rows_affected() == 0 {
        return Ok(Err(Refused::NotFound("Those maps aren't linked.")));
    }
    log_action(&mut tx, actor, "map.unlink", "map", a, None, json!({ "unlinked_from": b })).await?;
    tx.commit().await?;
    Ok(Ok(()))
}

/// Links every map of a game to the matching map of another (same original map, or same map
/// file), e.g. Season 1 to Season 0. Returns how many pairs were linked.
pub async fn link_games(pool: &PgPool, actor: &AdminOrService, game: i32, other: i32) -> ActionResult<u64> {
    if game == other {
        return Ok(Err(Refused::Invalid("Pick a different game or season.".into())));
    }
    let mut tx = pool.begin().await?;
    let linked = sqlx::query(
        r#"
            WITH a AS (
                SELECT m.steam_id, COALESCE(m.source_map, m.steam_id) AS origin, lower(m.bsp_name) AS bsp, c.is_multiplayer
                FROM maps AS m JOIN chapters AS c ON c.id = m.chapter_id WHERE c.game_id = $1
            ), b AS (
                SELECT m.steam_id, COALESCE(m.source_map, m.steam_id) AS origin, lower(m.bsp_name) AS bsp, c.is_multiplayer
                FROM maps AS m JOIN chapters AS c ON c.id = m.chapter_id WHERE c.game_id = $2
            )
            INSERT INTO map_links (map_a, map_b)
            SELECT DISTINCT LEAST(a.steam_id, b.steam_id), GREATEST(a.steam_id, b.steam_id)
            FROM a JOIN b ON a.is_multiplayer = b.is_multiplayer AND (a.origin = b.origin OR (a.bsp IS NOT NULL AND a.bsp = b.bsp))
            ON CONFLICT DO NOTHING
        "#,
    )
    .bind(game)
    .bind(other)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    log_action(&mut tx, actor, "game.link", "game", &game.to_string(), None, json!({ "linked_to": other, "maps": linked })).await?;
    tx.commit().await?;
    Ok(Ok(linked))
}

/// Removes every link between two games' maps.
pub async fn unlink_games(pool: &PgPool, actor: &AdminOrService, game: i32, other: i32) -> ActionResult<u64> {
    let mut tx = pool.begin().await?;
    let removed = sqlx::query(
        r#"
            DELETE FROM map_links AS l
            USING maps AS ma, chapters AS ca, maps AS mb, chapters AS cb
            WHERE ma.steam_id = l.map_a AND ca.id = ma.chapter_id AND mb.steam_id = l.map_b AND cb.id = mb.chapter_id
              AND ((ca.game_id = $1 AND cb.game_id = $2) OR (ca.game_id = $2 AND cb.game_id = $1))
        "#,
    )
    .bind(game)
    .bind(other)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    log_action(&mut tx, actor, "game.unlink", "game", &game.to_string(), None, json!({ "unlinked_from": other, "maps": removed })).await?;
    tx.commit().await?;
    Ok(Ok(removed))
}

#[derive(Debug, Deserialize)]
pub struct LayoutChapter {
    pub id: i32,
    pub maps: Vec<String>,
}

/// Saves a game's arrangement: chapter order, and which chapter each map is in, in order.
/// Maps can only move between chapters of the same game.
pub async fn save_layout(pool: &PgPool, actor: &AdminOrService, game_id: i32, chapters: &[LayoutChapter]) -> ActionResult<()> {
    let mut tx = pool.begin().await?;
    check!(editable_game(&mut tx, game_id).await?);
    let own_chapters: Vec<i32> = sqlx::query_scalar("SELECT id FROM chapters WHERE game_id = $1").bind(game_id).fetch_all(&mut *tx).await?;
    let own_maps: Vec<String> = sqlx::query_scalar("SELECT m.steam_id FROM maps AS m JOIN chapters AS c ON c.id = m.chapter_id WHERE c.game_id = $1")
        .bind(game_id)
        .fetch_all(&mut *tx)
        .await?;
    let mut listed: Vec<&String> = chapters.iter().flat_map(|c| c.maps.iter()).collect();
    listed.sort();
    listed.dedup();
    if chapters.iter().any(|c| !own_chapters.contains(&c.id)) || chapters.len() != own_chapters.len() {
        return Ok(Err(Refused::Invalid("The layout doesn't match this game's chapters; reload and try again.".into())));
    }
    if listed.len() != own_maps.len() || listed.iter().any(|m| !own_maps.contains(m)) {
        return Ok(Err(Refused::Invalid("The layout doesn't match this game's maps; reload and try again.".into())));
    }
    // A map keeps its singleplayer / co-op kind (co-op boards pair runs).
    let kinds: Vec<(String, bool)> = sqlx::query_as("SELECT m.steam_id, c.is_multiplayer FROM maps AS m JOIN chapters AS c ON c.id = m.chapter_id WHERE c.game_id = $1")
        .bind(game_id)
        .fetch_all(&mut *tx)
        .await?;
    let chapter_kinds: Vec<(i32, bool)> = sqlx::query_as("SELECT id, is_multiplayer FROM chapters WHERE game_id = $1").bind(game_id).fetch_all(&mut *tx).await?;
    for chapter in chapters {
        let multi = chapter_kinds.iter().find(|(id, _)| *id == chapter.id).map(|k| k.1);
        if chapter.maps.iter().any(|m| kinds.iter().find(|(id, _)| id == m).map(|k| k.1) != multi) {
            return Ok(Err(Refused::Invalid("Maps can't move between singleplayer and co-op chapters.".into())));
        }
    }
    let base: i32 = sqlx::query_scalar("SELECT COALESCE(MIN(sort_order), 1) FROM chapters WHERE game_id = $1").bind(game_id).fetch_one(&mut *tx).await?;
    let mut map_order = 1;
    for (i, chapter) in chapters.iter().enumerate() {
        sqlx::query("UPDATE chapters SET sort_order = $2 WHERE id = $1").bind(chapter.id).bind(base + i as i32).execute(&mut *tx).await?;
        for steam_id in &chapter.maps {
            sqlx::query("UPDATE maps SET chapter_id = $2, sort_order = $3 WHERE steam_id = $1").bind(steam_id).bind(chapter.id).bind(map_order).execute(&mut *tx).await?;
            map_order += 1;
        }
    }
    log_action(
        &mut tx,
        actor,
        "game.layout",
        "game",
        &game_id.to_string(),
        None,
        json!({ "chapters": chapters.iter().map(|c| json!({ "id": c.id, "maps": c.maps })).collect::<Vec<_>>() }),
    )
    .await?;
    tx.commit().await?;
    Ok(Ok(()))
}
