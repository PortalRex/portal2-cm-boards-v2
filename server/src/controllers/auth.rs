//! Database side of Steam sign-in: users, sessions and the OpenID replay guard.
use crate::{
    models::users::Users,
    tools::auth::{hash_token, random_token, SESSION_DAYS},
};
use sqlx::PgPool;

/// Records a Steam login response nonce; false if it was already used (a replay).
pub async fn claim_nonce(pool: &PgPool, nonce: &str) -> Result<bool, sqlx::Error> {
    sqlx::query("DELETE FROM openid_nonces WHERE seen_at < now() - interval '2 days'").execute(pool).await?;
    let res = sqlx::query("INSERT INTO openid_nonces (nonce) VALUES ($1) ON CONFLICT DO NOTHING")
        .bind(nonce)
        .execute(pool)
        .await?;
    Ok(res.rows_affected() == 1)
}

/// Creates or refreshes the user signing in. `steam` is their Steam profile when the Steam Web
/// API could be reached; the board name and everything else the board stores are kept.
pub async fn upsert_signed_in_user(pool: &PgPool, profile_number: &str, steam: Option<&Users>) -> Result<(), sqlx::Error> {
    let created = sqlx::query(
        r#"
            INSERT INTO users (profile_number, steam_name, avatar, banned, registered, admin)
            VALUES ($1, $2, $3, false, 1, 0)
            ON CONFLICT (profile_number) DO UPDATE
            SET steam_name = COALESCE(EXCLUDED.steam_name, users.steam_name),
                avatar = CASE WHEN users.avatar_locked OR users.avatar_custom THEN users.avatar ELSE COALESCE(EXCLUDED.avatar, users.avatar) END,
                registered = 1
            RETURNING (xmax = 0) AS created
        "#,
    )
    .bind(profile_number)
    .bind(steam.and_then(|u| u.steam_name.clone()))
    .bind(steam.and_then(|u| u.avatar.clone()))
    .fetch_one(pool)
    .await
    .map(|row: sqlx::postgres::PgRow| sqlx::Row::get::<bool, _>(&row, "created"))?;
    // A new account starts with its Steam country (later sign-ins leave the player's choice alone).
    if created {
        Users::set_default_country(pool, profile_number, steam.and_then(|u| u.steam_country.as_deref())).await?;
    }
    Ok(())
}

/// Starts a session and returns the cookie token (only its hash is stored).
pub async fn create_session(pool: &PgPool, profile_number: &str, user_agent: Option<&str>) -> Result<String, sqlx::Error> {
    sqlx::query("DELETE FROM sessions WHERE expires_at < now()").execute(pool).await?;
    let token = random_token();
    sqlx::query(
        r#"
            INSERT INTO sessions (token_hash, profile_number, expires_at, user_agent)
            VALUES ($1, $2, now() + make_interval(days => $3), $4)
        "#,
    )
    .bind(hash_token(&token))
    .bind(profile_number)
    .bind(SESSION_DAYS as i32)
    .bind(user_agent.map(|ua| ua.chars().take(200).collect::<String>()))
    .execute(pool)
    .await?;
    Ok(token)
}

pub async fn delete_session(pool: &PgPool, token: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM sessions WHERE token_hash = $1").bind(hash_token(token)).execute(pool).await?;
    Ok(())
}
