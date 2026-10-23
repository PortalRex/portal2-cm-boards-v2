//! SAR auto-submit (the old boards' `/api-v2`, see `api::v2`): players' submit keys, and the
//! lookups SAR makes around a run (current PB, the times around it, the maps).
//!
//! A submit key is 32 random hex characters (128 bits) that the player pastes into SAR's
//! `autosubmit.key`. Only its SHA-256 is stored (`users.submit_key_hash`), so a copy of the
//! database doesn't hand out keys; the player sees it once, when it's made.
use crate::controllers::{moderation::FILLER, submissions::BoardMap};
use sqlx::{FromRow, PgPool};

/// The longest key accepted (SAR's are 32 characters; anything longer is refused unread).
pub const MAX_KEY_LEN: usize = 64;

/// The owner of a submit key.
#[derive(Debug, FromRow)]
pub struct KeyOwner {
    pub profile_number: String,
    pub banned: bool,
    pub frozen: bool,
    /// Has a staff role (verifier, moderator or admin), as `AuthUser::is_admin`.
    pub staff: bool,
}

/// Whether a key has the shape SAR accepts: 1–64 ASCII letters and digits.
pub fn key_shape_ok(key: &str) -> bool {
    !key.is_empty() && key.len() <= MAX_KEY_LEN && key.bytes().all(|b| b.is_ascii_alphanumeric())
}

/// A new key: 32 lowercase hex characters (SAR only accepts letters and digits).
pub fn new_key() -> String {
    crate::tools::auth::random_token()[..32].to_string()
}

fn key_hash(key: &str) -> Vec<u8> {
    crate::tools::auth::hash_token(key)
}

/// The account a key belongs to, if any.
pub async fn owner_of(pool: &PgPool, key: &str) -> Result<Option<KeyOwner>, sqlx::Error> {
    if !key_shape_ok(key) {
        return Ok(None);
    }
    sqlx::query_as::<_, KeyOwner>(
        r#"
            SELECT profile_number, banned, frozen,
                (role IS NOT NULL) AS staff
            FROM users WHERE submit_key_hash = $1 AND profile_number <> $2
        "#,
    )
    .bind(key_hash(key))
    .bind(FILLER)
    .fetch_optional(pool)
    .await
}

/// When the player's key was made, or None without one.
pub async fn key_created(pool: &PgPool, profile_number: &str) -> Result<Option<Option<chrono::NaiveDateTime>>, sqlx::Error> {
    let row: Option<(Option<Vec<u8>>, Option<chrono::NaiveDateTime>)> =
        sqlx::query_as("SELECT submit_key_hash, submit_key_created FROM users WHERE profile_number = $1")
            .bind(profile_number)
            .fetch_optional(pool)
            .await?;
    Ok(row.and_then(|(hash, created)| hash.map(|_| created)))
}

/// Makes a new key for the player (replacing the old one) and returns it: the only time it's seen.
pub async fn reset_key(pool: &PgPool, profile_number: &str) -> Result<String, sqlx::Error> {
    // A collision on 128 random bits won't happen, but the unique index would refuse it: retry.
    for _ in 0..3 {
        let key = new_key();
        let res = sqlx::query("UPDATE users SET submit_key_hash = $2, submit_key_created = now() AT TIME ZONE 'utc' WHERE profile_number = $1")
            .bind(profile_number)
            .bind(key_hash(&key))
            .execute(pool)
            .await;
        match res {
            Ok(_) => return Ok(key),
            Err(sqlx::Error::Database(e)) if e.is_unique_violation() => continue,
            Err(e) => return Err(e),
        }
    }
    Err(sqlx::Error::Protocol("couldn't make a unique submit key".into()))
}

/// Removes the player's key (SAR stops submitting until they make a new one).
pub async fn remove_key(pool: &PgPool, profile_number: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE users SET submit_key_hash = NULL, submit_key_created = NULL WHERE profile_number = $1")
        .bind(profile_number)
        .execute(pool)
        .await?;
    Ok(())
}

/// A board map SAR can submit to: a real map (not a linked season copy) with a board category.
pub async fn submit_map(pool: &PgPool, map_id: &str) -> Result<Option<(BoardMap, Option<String>)>, sqlx::Error> {
    #[derive(FromRow)]
    struct Row {
        #[sqlx(flatten)]
        map: BoardMap,
        bsp_name: Option<String>,
    }
    let row = sqlx::query_as::<_, Row>(
        r#"
            SELECT m.steam_id, m.name, c.game_id, c.game_mode, c.is_multiplayer AS is_coop, m.default_cat_id, m.bsp_name
            FROM maps AS m JOIN chapters AS c ON c.id = m.chapter_id
            WHERE m.steam_id = $1 AND m.source_map IS NULL AND m.default_cat_id IS NOT NULL
        "#,
    )
    .bind(map_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| (r.map, r.bsp_name)))
}

/// The player's current PB on a map, as SAR compares against it: verified, not banned, in the
/// map's main category (a time waiting for its demo doesn't count, as on the old boards).
#[derive(Debug, FromRow)]
pub struct CurrentPb {
    pub id: i64,
    pub score: i32,
    pub timestamp: Option<chrono::NaiveDateTime>,
}

pub async fn current_pb(pool: &PgPool, map: &BoardMap, profile_number: &str) -> Result<Option<CurrentPb>, sqlx::Error> {
    sqlx::query_as::<_, CurrentPb>(
        r#"
            SELECT id, score, timestamp FROM changelog
            WHERE profile_number = $1 AND map_id = $2 AND category_id = $3 AND verified AND NOT banned
            ORDER BY score ASC, timestamp ASC LIMIT 1
        "#,
    )
    .bind(profile_number)
    .bind(&map.steam_id)
    .bind(map.default_cat_id)
    .fetch_optional(pool)
    .await
}

/// The player's run of exactly this time on the map that has no demo yet (one the Steam sync
/// picked up before SAR submitted it), which the demo should go on instead of a new entry.
pub async fn run_waiting_for_demo(pool: &PgPool, map: &BoardMap, profile_number: &str, score: i32) -> Result<Option<i64>, sqlx::Error> {
    sqlx::query_scalar(
        r#"
            SELECT id FROM changelog
            WHERE profile_number = $1 AND map_id = $2 AND category_id = $3 AND score = $4
              AND demo_id IS NULL AND NOT banned AND mirror_of IS NULL
            ORDER BY timestamp DESC NULLS LAST LIMIT 1
        "#,
    )
    .bind(profile_number)
    .bind(&map.steam_id)
    .bind(map.default_cat_id)
    .bind(score)
    .fetch_optional(pool)
    .await
}

/// One player's place on a map's board, for SAR's in-game times list.
#[derive(Debug, Clone, FromRow)]
pub struct BoardPlace {
    pub profile_number: String,
    pub user_name: String,
    pub avatar: Option<String>,
    pub score: i32,
    pub timestamp: Option<chrono::NaiveDateTime>,
}

/// Every player's best verified, unbanned time on the map (co-op: each player of a run, once),
/// fastest first, at most `limit`.
pub async fn board_places(pool: &PgPool, map: &BoardMap, limit: i64) -> Result<Vec<BoardPlace>, sqlx::Error> {
    sqlx::query_as::<_, BoardPlace>(
        r#"
            SELECT DISTINCT ON (cl.profile_number) cl.profile_number,
                COALESCE(u.board_name, u.steam_name, cl.profile_number) AS user_name, u.avatar, cl.score, cl.timestamp
            FROM changelog AS cl JOIN users AS u ON u.profile_number = cl.profile_number
            WHERE cl.map_id = $1 AND cl.category_id = $2 AND cl.verified AND NOT cl.banned AND NOT u.banned
              AND cl.profile_number <> $3
            ORDER BY cl.profile_number, cl.score ASC, cl.timestamp ASC
        "#,
    )
    .bind(&map.steam_id)
    .bind(map.default_cat_id)
    .bind(FILLER)
    .fetch_all(pool)
    .await
    .map(|mut places| {
        places.sort_by(|a, b| a.score.cmp(&b.score).then(a.timestamp.cmp(&b.timestamp)));
        places.truncate(limit.max(0) as usize);
        places
    })
}

/// The slice of `places` SAR shows: `before` places above the player and `after` below, shifted
/// to stay inside the board, or the top when the player isn't on it (as the old boards did).
pub fn around<T: Clone>(places: &[T], index: Option<usize>, before: usize, after: usize) -> Vec<T> {
    let len = before + after + 1;
    let Some(i) = index else {
        return places.iter().take(len).cloned().collect();
    };
    let last = places.len().saturating_sub(1);
    let mut start = i.saturating_sub(before);
    let end = i + after;
    if end > last {
        start = start.saturating_sub(end - last);
    }
    places.iter().skip(start).take(len).cloned().collect()
}

/// Map file names and ids of a game's board maps, for SAR (`download-maps`).
pub async fn game_maps(pool: &PgPool, game_id: i32) -> Result<Vec<(String, String)>, sqlx::Error> {
    sqlx::query_as(
        r#"
            SELECT m.bsp_name, m.steam_id FROM maps AS m JOIN chapters AS c ON c.id = m.chapter_id
            WHERE c.game_id = $1 AND m.source_map IS NULL AND m.default_cat_id IS NOT NULL AND m.bsp_name IS NOT NULL
            ORDER BY m.id
        "#,
    )
    .bind(game_id)
    .fetch_all(pool)
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_are_what_sar_accepts() {
        let k = new_key();
        assert_eq!(k.len(), 32);
        assert!(key_shape_ok(&k));
        assert_ne!(new_key(), k);
        assert!(!key_shape_ok(""));
        assert!(!key_shape_ok("abc def"));
        assert!(!key_shape_ok("abc'--"));
        assert!(!key_shape_ok(&"a".repeat(MAX_KEY_LEN + 1)));
    }

    #[test]
    fn around_keeps_the_window_on_the_board() {
        let b: Vec<i32> = (1..=10).collect();
        // Middle: 3 above, 2 below.
        assert_eq!(around(&b, Some(5), 3, 2), vec![3, 4, 5, 6, 7, 8]);
        // Near the top: shifted down, not cut.
        assert_eq!(around(&b, Some(1), 3, 2), vec![1, 2, 3, 4, 5, 6]);
        // Near the bottom: shifted up so it still shows six.
        assert_eq!(around(&b, Some(9), 3, 2), vec![5, 6, 7, 8, 9, 10]);
        // Not on the board: the top.
        assert_eq!(around(&b, None, 3, 2), vec![1, 2, 3, 4, 5, 6]);
        // Short boards.
        assert_eq!(around(&b[..2], Some(1), 3, 2), vec![1, 2]);
        assert_eq!(around::<i32>(&[], None, 3, 2), Vec::<i32>::new());
    }
}
