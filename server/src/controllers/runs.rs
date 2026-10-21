//! Per-run extras: both players' halves of a co-op run, and thumbs up / down reactions.
use sqlx::{FromRow, PgPool};

/// One player's half of a co-op run. `changelog_id` and the run fields are empty when the
/// player has no run of their own recorded (partner without a submission); `demo_id` is then
/// their partner demo, if they added one (the run wasn't a personal best for them).
#[derive(Debug, Serialize, FromRow)]
pub struct CoopHalf {
    pub profile_number: Option<String>,
    pub user_name: Option<String>,
    pub avatar: Option<String>,
    /// Played blue (hosted). Null when unknown.
    pub is_host: Option<bool>,
    pub changelog_id: Option<i64>,
    pub score: Option<i32>,
    pub timestamp: Option<chrono::NaiveDateTime>,
    pub note: Option<String>,
    pub youtube_id: Option<String>,
    pub autorender_id: Option<String>,
    pub demo_id: Option<i64>,
    pub has_segments: bool,
    /// Portals placed and SAR version, read from the demo.
    pub portals: Option<i16>,
    pub sar_version: Option<String>,
}

/// Both halves of a co-op run, blue (the host) first when known.
pub async fn coop_halves(pool: &PgPool, coop_id: i64) -> Result<Vec<CoopHalf>, sqlx::Error> {
    sqlx::query_as::<_, CoopHalf>(
        r#"
            WITH cb AS (SELECT * FROM coop_bundled WHERE id = $1),
            slots AS (
                SELECT 1 AS slot, p_id1 AS profile_number, cl_id1 AS cl_id, p1_is_host AS is_host, partner_demo_id FROM cb
                UNION ALL
                SELECT 2, p_id2, cl_id2, NOT p1_is_host, partner_demo_id FROM cb
            )
            SELECT NULLIF(s.profile_number, 'N/A') AS profile_number,
                   CASE WHEN s.profile_number = 'N/A' THEN NULL ELSE COALESCE(u.board_name, u.steam_name, s.profile_number) END AS user_name,
                   u.avatar, s.is_host,
                   run.id AS changelog_id, run.score, run.timestamp, run.note, run.youtube_id, run.autorender_id, dm.demo_id,
                   run.segments IS NOT NULL AS has_segments,
                   run.portals, (SELECT d.sar_version FROM demos AS d WHERE d.id = dm.demo_id) AS sar_version
            FROM slots AS s
            LEFT JOIN users AS u ON u.profile_number = s.profile_number
            LEFT JOIN changelog AS run ON run.id = s.cl_id AND run.profile_number <> 'N/A'
            -- A known partner without a run of their own: their partner demo.
            CROSS JOIN LATERAL (
                SELECT COALESCE(run.demo_id, CASE WHEN run.id IS NULL AND s.profile_number <> 'N/A' THEN s.partner_demo_id END) AS demo_id
            ) AS dm
            ORDER BY CASE WHEN s.is_host IS FALSE THEN 1 ELSE 0 END, s.slot
        "#,
    )
    .bind(coop_id)
    .fetch_all(pool)
    .await
}

/// Reaction counts for a run, and the viewer's own (1 up, -1 down).
#[derive(Debug, Serialize, FromRow)]
pub struct Reactions {
    pub up: i64,
    pub down: i64,
    pub mine: Option<i16>,
}

/// The id reactions are stored under: a co-op run's first changelog entry, else the run itself.
async fn reaction_target(pool: &PgPool, cl_id: i64) -> Result<Option<i64>, sqlx::Error> {
    sqlx::query_scalar(
        r#"
            SELECT COALESCE(cb.cl_id1, cl.id) FROM changelog AS cl
            LEFT JOIN coop_bundled AS cb ON cb.id = cl.coop_id
            WHERE cl.id = $1 AND cl.profile_number <> 'N/A'
        "#,
    )
    .bind(cl_id)
    .fetch_optional(pool)
    .await
}

pub async fn reactions(pool: &PgPool, cl_id: i64, viewer: Option<&str>) -> Result<Option<Reactions>, sqlx::Error> {
    let Some(target) = reaction_target(pool, cl_id).await? else {
        return Ok(None);
    };
    let r = sqlx::query_as::<_, Reactions>(
        r#"
            SELECT COUNT(*) FILTER (WHERE reaction = 1) AS up,
                   COUNT(*) FILTER (WHERE reaction = -1) AS down,
                   MAX(reaction) FILTER (WHERE profile_number = $2) AS mine
            FROM run_reactions WHERE changelog_id = $1
        "#,
    )
    .bind(target)
    .bind(viewer)
    .fetch_one(pool)
    .await?;
    Ok(Some(r))
}

/// The viewer's reactions on several runs: (requested id, reaction) for the ones they reacted to.
pub async fn my_reactions(pool: &PgPool, ids: &[i64], profile_number: &str) -> Result<Vec<(i64, i16)>, sqlx::Error> {
    sqlx::query_as(
        r#"
            SELECT cl.id, rr.reaction FROM changelog AS cl
            LEFT JOIN coop_bundled AS cb ON cb.id = cl.coop_id
            JOIN run_reactions AS rr ON rr.changelog_id = COALESCE(cb.cl_id1, cl.id) AND rr.profile_number = $2
            WHERE cl.id = ANY($1)
        "#,
    )
    .bind(ids)
    .bind(profile_number)
    .fetch_all(pool)
    .await
}

/// Sets (or with `None` clears) a user's reaction, and records the change in
/// `run_reaction_events` (in the same transaction). Returns false for an unknown run.
pub async fn set_reaction(pool: &PgPool, cl_id: i64, profile_number: &str, reaction: Option<i16>) -> Result<bool, sqlx::Error> {
    let Some(target) = reaction_target(pool, cl_id).await? else {
        return Ok(false);
    };
    let mut tx = pool.begin().await?;
    let before: Option<i16> = sqlx::query_scalar("SELECT reaction FROM run_reactions WHERE changelog_id = $1 AND profile_number = $2 FOR UPDATE")
        .bind(target)
        .bind(profile_number)
        .fetch_optional(&mut *tx)
        .await?;
    if before == reaction {
        return Ok(true); // nothing changed
    }
    match reaction {
        Some(r) => {
            sqlx::query(
                r#"
                    INSERT INTO run_reactions (changelog_id, profile_number, reaction) VALUES ($1, $2, $3)
                    ON CONFLICT (changelog_id, profile_number) DO UPDATE SET reaction = EXCLUDED.reaction, created_at = now()
                "#,
            )
            .bind(target)
            .bind(profile_number)
            .bind(r)
            .execute(&mut *tx)
            .await?;
        }
        None => {
            sqlx::query("DELETE FROM run_reactions WHERE changelog_id = $1 AND profile_number = $2")
                .bind(target)
                .bind(profile_number)
                .execute(&mut *tx)
                .await?;
        }
    }
    sqlx::query("INSERT INTO run_reaction_events (changelog_id, profile_number, reaction) VALUES ($1, $2, $3)")
        .bind(target)
        .bind(profile_number)
        .bind(reaction)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(true)
}

/// A player's reaction (current, or one change in the history).
#[derive(Debug, Serialize, FromRow)]
pub struct ReactionEntry {
    pub profile_number: String,
    pub user_name: String,
    pub avatar: Option<String>,
    /// 1 up, -1 down, null cleared (history only).
    pub reaction: Option<i16>,
    pub created_at: chrono::NaiveDateTime,
}

/// Staff view of a run's reactions: who reacted now, and the latest changes.
#[derive(Debug, Serialize)]
pub struct ReactionRecord {
    pub current: Vec<ReactionEntry>,
    pub history: Vec<ReactionEntry>,
}

pub async fn reaction_record(pool: &PgPool, cl_id: i64) -> Result<Option<ReactionRecord>, sqlx::Error> {
    let Some(target) = reaction_target(pool, cl_id).await? else {
        return Ok(None);
    };
    let select = |table: &str, extra: &str| {
        format!(
            r#"
                SELECT r.profile_number, COALESCE(u.board_name, u.steam_name, r.profile_number) AS user_name, u.avatar,
                       r.reaction, r.created_at
                FROM {table} AS r JOIN users AS u ON u.profile_number = r.profile_number
                WHERE r.changelog_id = $1
                ORDER BY r.created_at DESC {extra}
            "#
        )
    };
    let current = sqlx::query_as::<_, ReactionEntry>(&select("run_reactions", "")).bind(target).fetch_all(pool).await?;
    let history = sqlx::query_as::<_, ReactionEntry>(&select("run_reaction_events", "LIMIT 100")).bind(target).fetch_all(pool).await?;
    Ok(Some(ReactionRecord { current, history }))
}
