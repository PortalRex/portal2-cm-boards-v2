use std::collections::HashMap;
use sqlx::PgPool;
use chrono::NaiveDateTime;
use crate::models::changelog::*;
use crate::models::users::Users;

// Implementations of associated functions for Changelog
impl Changelog {
    /// The run's mtrigger segments as JSON text: `None` for an unknown run, `Some(None)` when
    /// the run has no segment data.
    pub async fn get_segments(pool: &PgPool, cl_id: i64) -> Result<Option<Option<String>>, sqlx::Error> {
        sqlx::query_scalar::<_, Option<String>>("SELECT segments::text FROM changelog WHERE id = $1")
            .bind(cl_id)
            .fetch_optional(pool)
            .await
    }
    /// Search for a [Changelog] by ID, return the entire [Changelog].
    pub async fn get_changelog(pool: &PgPool, cl_id: i64) -> Result<Option<Changelog>, sqlx::Error> {
        sqlx::query_as::<_, Changelog>(r#"SELECT * FROM changelog WHERE id = $1"#)
            .bind(cl_id)
            .fetch_optional(pool)
            .await
    }
    /// Check for if a given score already exists in the database, but is banned. Used for the auto-updating from Steam leaderboards.
    /// 
    /// Returns `true` if there is a value found, `false` if no value, or returns an error.
    pub async fn check_banned_scores(pool: &PgPool, params: ScoreLookup) -> std::result::Result<bool, sqlx::Error> {
        // We don't care about the result, we only care if there is a result.
        let res = sqlx::query(r#" 
                SELECT * 
                FROM changelog
                    INNER JOIN maps ON (maps.steam_id = changelog.map_id)
                    INNER JOIN chapters ON (chapters.id = maps.chapter_id)
                WHERE changelog.score = $1
                    AND changelog.map_id = $2
                    AND changelog.profile_number = $3
                    AND changelog.banned = $4
                    AND changelog.category_id = $5
                    AND chapters.game_id = $6"#)
            .bind(params.score)
            .bind(params.map_id)
            .bind(params.profile_number)
            .bind(true)
            .bind(params.cat_id.unwrap())
            .bind(params.game_id.unwrap())
            .fetch_optional(pool)
            .await?;
        match res {
            Some(_) => Ok(true),
            None => Ok(false),
        }
    }
    /// Returns a vec of [Changelog] for a user's personal best history on a given singleplayer map.
    /// 
    /// The function does not check to make sure that the map_id is singleplayer, but it is returned as a changelog entry,
    /// and no special join is done to handle coop-specific personal best history.
    pub async fn get_sp_pb_history(pool: &PgPool, profile_number: &str, map_id: &str, cat_id: i32, game_id: i32) -> Result<Vec<Changelog>, sqlx::Error> {
        sqlx::query_as::<_, Changelog>(r#" 
                SELECT changelog.* 
                FROM changelog
                    INNER JOIN maps ON (maps.steam_id = changelog.map_id)
                    INNER JOIN chapters ON (chapters.id = maps.chapter_id)
                WHERE changelog.profile_number = $1
                    AND changelog.map_id = $2
                    AND changelog.category_id = $3
                    AND chapters.game_id = $4
                ORDER BY changelog.timestamp DESC NULLS LAST"#)
            .bind(profile_number)
            .bind(map_id)
            .bind(cat_id)
            .bind(game_id)
            .fetch_all(pool)
            .await
    }
    /// Deletes all references to a `demo_id` in `changelog`.
    pub async fn delete_references_to_demo(pool: &PgPool, demo_id: i64) -> Result<Vec<i64>, sqlx::Error> {
        sqlx::query_scalar(r#"UPDATE changelog SET demo_id = NULL WHERE demo_id = $1 RETURNING id;"#)
            .bind(demo_id)
            .fetch_all(pool)
            .await
    }
    /// Deletes all references to a `coop_id` in `changelog`
    #[allow(dead_code)]
    pub async fn delete_references_to_coop_id(pool: &PgPool, coop_id: i64) -> Result<Vec<i64>, sqlx::Error> {
        sqlx::query_scalar(r#"UPDATE changelog SET coop_id NULL WHERE coop_id = $1 RETURNING id;"#)
            .bind(coop_id)
            .fetch_all(pool)
            .await
    }
    /// Insert a new changelog entry.
    pub async fn insert_changelog(pool: &PgPool, cl: ChangelogInsert) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar(r#"
                INSERT INTO changelog 
                (timestamp, profile_number, score, map_id, demo_id, banned, 
                youtube_id, coop_id, post_rank, pre_rank, submission, note,
                category_id, score_delta, verified, admin_note) VALUES 
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                RETURNING id"#)
            .bind(cl.timestamp).bind(cl.profile_number).bind(cl.score).bind(cl.map_id) // TODO: There has GOT to be a better way to do this... https://crates.io/crates/sqlxinsert ?
            .bind(cl.demo_id).bind(cl.banned).bind(cl.youtube_id).bind(cl.coop_id).bind(cl.post_rank)
            .bind(cl.pre_rank).bind(cl.submission).bind(cl.note).bind(cl.category_id)
            .bind(cl.score_delta).bind(cl.verified).bind(cl.admin_note)
            .fetch_one(pool)
            .await
    }
    /// Updates all fields (except ID) for a given changelog entry. Returns the updated [Changelog].
    pub async fn update_changelog(pool: &PgPool, update: Changelog) -> Result<Changelog, sqlx::Error> {
        sqlx::query_as::<_, Changelog>(r#"UPDATE changelog 
                SET timestamp = $1, profile_number = $2, score = $3, map_id = $4, demo_id = $5, banned = $6, 
                youtube_id = $7, coop_id = $8, post_rank = $9, pre_rank = $10, submission = $11, note = $12,
                category_id = $13, score_delta = $14, verified = $15, admin_note = $16
                WHERE id = $17 RETURNING *"#)
            .bind(update.timestamp).bind(update.profile_number).bind(update.score).bind(update.map_id) 
            .bind(update.demo_id).bind(update.banned).bind(update.youtube_id).bind(update.coop_id)
            .bind(update.post_rank).bind(update.pre_rank).bind(update.submission).bind(update.note)
            .bind(update.category_id).bind(update.score_delta).bind(update.verified).bind(update.admin_note)
            .bind(update.id)
            .fetch_one(pool)
            .await
    }
    /// Updates `demo_id` in a given changelog entry, returns the new [Changelog].
    pub async fn update_demo_id_in_changelog(pool: &PgPool, cl_id: i64, demo_id: i64) -> Result<Changelog, sqlx::Error> {
        sqlx::query_as::<_, Changelog>(r#"UPDATE changelog 
                SET demo_id = $1 WHERE id = $2 RETURNING *;"#)
            .bind(demo_id)
            .bind(cl_id)
            .fetch_one(pool)
            .await
    }
    #[allow(dead_code)]
    /// Deletes a changelog entry on the give ID.
    pub async fn delete_changelog(pool: &PgPool, cl_id: i64) -> Result<Changelog, sqlx::Error> {
        sqlx::query_as::<_, Changelog>(r#"DELETE FROM changelog WHERE id = $1 RETURNING *"#)
            .bind(cl_id)
            .fetch_one(pool)
            .await
    }
    
}

impl ChangelogPage {
    /// Display page for the changelog
    ///
    /// Takes a list of parameters, returns a filtered list of changelog entries.
    ///
    /// Returns a [ChangelogPage], which contains information specifc for displaying on the web.
    pub async fn get_changelog_page(
        pool: &PgPool,
        params: ChangelogQueryParams,
    ) -> Result<Vec<ChangelogPage>, sqlx::Error> {        
        let query_string = build_filtered_changelog(pool, params, None).await?;
        let res = sqlx::query_as::<_, ChangelogPage>(&query_string)
            .fetch_all(pool)
            .await?;
        Ok(res)
    }

    /// Runs set between `start` and `end` (UTC), optionally on one map: verified, unbanned runs
    /// by unbanned players, keeping each player's fastest run per map (a co-op run once, for
    /// both players). Fastest first.
    pub async fn best_runs_between(pool: &PgPool, game_id: i32, start: NaiveDateTime, end: NaiveDateTime, map_id: Option<&str>) -> Result<Vec<ChangelogPage>, sqlx::Error> {
        let params = ChangelogQueryParams { limit: Some(5000), game_id: Some(game_id), chamber: map_id.map(str::to_string), ..Default::default() };
        let mut filters = vec![
            format!("cl.timestamp >= '{}'\n", start.format("%Y-%m-%d %H:%M:%S")),
            format!("cl.timestamp < '{}'\n", end.format("%Y-%m-%d %H:%M:%S")),
            "cl.verified IS TRUE\n".to_string(),
            "cl.banned = false\n".to_string(),
            "u.banned IS NOT TRUE\n".to_string(),
            "cl.post_rank IS NOT NULL\n".to_string(),
            "cl.profile_number <> 'N/A'\n".to_string(),
        ];
        let query_string = build_filtered_changelog(pool, params, Some(&mut filters)).await?;
        let mut runs = sqlx::query_as::<_, ChangelogPage>(&query_string).fetch_all(pool).await?;
        runs.sort_by(|a, b| a.score.cmp(&b.score).then(a.timestamp.cmp(&b.timestamp)));
        let mut seen = std::collections::HashSet::new();
        runs.retain(|r| {
            let players: Vec<&str> = [Some(r.profile_number.as_str()), r.blue_profile_number.as_deref(), r.orange_profile_number.as_deref()]
                .into_iter()
                .flatten()
                .filter(|p| *p != "N/A")
                .collect();
            if players.iter().any(|p| seen.contains(&(r.map_id.clone(), p.to_string()))) {
                return false;
            }
            for p in players {
                seen.insert((r.map_id.clone(), p.to_string()));
            }
            true
        });
        Ok(runs)
    }

    /// The best `count` runs set between `start` and `end`: best rank first, then the biggest
    /// improvement, then the earliest.
    pub async fn top_runs_between(pool: &PgPool, game_id: i32, start: NaiveDateTime, end: NaiveDateTime, count: usize) -> Result<Vec<ChangelogPage>, sqlx::Error> {
        let mut runs = Self::best_runs_between(pool, game_id, start, end, None).await?;
        runs.sort_by(|a, b| {
            a.post_rank
                .cmp(&b.post_rank)
                .then(a.score_delta.unwrap_or(0).cmp(&b.score_delta.unwrap_or(0)))
                .then(a.timestamp.cmp(&b.timestamp))
        });
        runs.truncate(count);
        Ok(runs)
    }
}

/// A day's daily chamber for one board (singleplayer, co-op, Mel Story, Mel Advanced).
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct DailyMap {
    pub steam_id: String,
    pub name: String,
    pub game_mode: String,
    pub is_coop: bool,
}

/// The daily chambers for a game on a day: one map per board, picked by a hash of the date and
/// board, so everyone gets the same maps and they change at midnight UTC.
pub async fn daily_maps(pool: &PgPool, game_id: i32, day: chrono::NaiveDate) -> Result<Vec<DailyMap>, sqlx::Error> {
    let maps = sqlx::query_as::<_, DailyMap>(
        r#"
            SELECT m.steam_id, m.name, c.game_mode, c.is_multiplayer AS is_coop
            FROM maps AS m JOIN chapters AS c ON c.id = m.chapter_id
            WHERE c.game_id = $1 AND m.default_cat_id IS NOT NULL
            ORDER BY c.is_multiplayer, c.game_mode, m.id
        "#,
    )
    .bind(game_id)
    .fetch_all(pool)
    .await?;
    let mut modes: Vec<String> = Vec::new();
    for m in &maps {
        if !modes.contains(&m.game_mode) {
            modes.push(m.game_mode.clone());
        }
    }
    Ok(modes
        .iter()
        .map(|mode| {
            let pool: Vec<&DailyMap> = maps.iter().filter(|m| &m.game_mode == mode).collect();
            pool[(daily_hash(&format!("{day}:{mode}")) % pool.len() as u64) as usize].clone()
        })
        .collect())
}

/// FNV-1a, so the pick doesn't depend on the Rust version's default hasher.
fn daily_hash(key: &str) -> u64 {
    key.bytes().fold(0xcbf29ce484222325u64, |h, b| (h ^ b as u64).wrapping_mul(0x100000001b3))
}

impl Graph {
    /// Return all [Maps] on a given `game_id`.
    pub async fn get_graph_data(
        pool: &PgPool
    ) -> Result<Vec<Graph>, sqlx::Error> {
        let res = sqlx::query_as::<_, Graph>(
            r#"
            SELECT DATE(timestamp) AS date, COUNT(*) AS count
            FROM changelog
            GROUP BY DATE(timestamp)
            ORDER BY DATE(timestamp) 
            DESC
            "#
        )
            .fetch_all(pool)
            .await?;
        Ok(res)
    }
}

/// Build a query String based off a pre-defined string. You pass in a [crate::models::changelog::ChangelogQueryParams], and an optional vector of additional filers.
/// 
/// Each element of the vector of additional filters will be assigned the correct "WHERE" or "AND", as appropriate.
/// 
/// ## Exanple use
/// ```rust
/// use crate::controllers::changelog::build_filtered_changelog;
/// 
/// async fn test_adding_filters() {
///     let mut additional_filters: Vec<String> =
///         vec!["(cl.banned = 'true' OR cl.verified = 'false' OR u.banned = 'true')".to_string(),
///         "u.profile_number = '76561198135023038'".to_string()];
///     let query_string = build_filtered_changelog(pool, params, Some(&mut additional_filters)).await.unwrap();
/// }
/// ```
/// 
pub async fn build_filtered_changelog(pool: &PgPool, params: ChangelogQueryParams, additional_filters: Option<&mut Vec<String>>) -> Result<String, sqlx::Error> {
    let mut query_string: String = String::from(
        r#" 
        SELECT cl.id, cl.timestamp, cl.profile_number, cl.score, cl.map_id, cl.demo_id, cl.banned,
            cl.youtube_id, cl.previous_id, cl.coop_id, cl.post_rank, cl.pre_rank, cl.submission, cl.note,
            cl.category_id, cl.score_delta, cl.verified, cl.admin_note, cl.autorender_id, cl.wr_hidden, map.name AS map_name,
            COALESCE(u.board_name, u.steam_name, cl.profile_number) AS user_name, COALESCE(u.avatar, '') AS avatar,
            COALESCE(p1.board_name, p1.steam_name, p1.profile_number) AS blue_name,
            COALESCE(p2.board_name, p2.steam_name, p2.profile_number) AS orange_name,
            p1.avatar AS blue_avatar, p2.avatar AS orange_avatar,
            p1.profile_number AS blue_profile_number, p2.profile_number AS orange_profile_number,
            coop.p1_is_host IS NOT NULL AS coop_roles_known,
            (SELECT COUNT(*) FROM run_reactions AS rr WHERE rr.changelog_id = COALESCE(coop.cl_id1, cl.id) AND rr.reaction = 1) AS reactions_up,
            (SELECT COUNT(*) FROM run_reactions AS rr WHERE rr.changelog_id = COALESCE(coop.cl_id1, cl.id) AND rr.reaction = -1) AS reactions_down
                FROM changelog AS cl
                    LEFT JOIN users AS u ON (u.profile_number = cl.profile_number)
                    INNER JOIN maps AS map ON (map.steam_id = cl.map_id)
                    INNER JOIN chapters AS chapter on (map.chapter_id = chapter.id)
                    LEFT JOIN coop_bundled AS coop on (cl.coop_id = coop.id)
                    -- Blue is the host; p1_is_host is false when the second player hosted.
                    LEFT JOIN users AS p1 ON p1.profile_number = (CASE WHEN coop.p1_is_host IS FALSE THEN coop.p_id2 ELSE coop.p_id1 END)
                    LEFT JOIN users AS p2 ON p2.profile_number = (CASE WHEN coop.p1_is_host IS FALSE THEN coop.p_id1 ELSE coop.p_id2 END)
    "#,
    );
    let mut filters: Vec<String> = vec![format!("chapter.game_id = {}
", params.game_id.unwrap_or(1))];
    if let Some(coop) = params.coop {
        if !coop {
            filters.push("chapter.is_multiplayer = False\n".to_string());
        } else if let Some(sp) = params.sp {
            if !sp {
                filters.push("chapter.is_multiplayer = True\n".to_string());
            }
        }
    }
    if let Some(has_demo) = params.has_demo {
        if has_demo {
            filters.push("cl.demo_id IS NOT NULL\n".to_string());
        } else {
            filters.push("cl.demo_id IS NULL\n".to_string());
        }
    }
    if let Some(yt) = params.yt {
        if yt {
            filters.push("cl.youtube_id IS NOT NULL\n".to_string());
        } else {
            filters.push("cl.youtube_id IS NULL\n".to_string());
        }
    }
    if let Some(wr_gain) = params.wr_gain {
        if wr_gain {
            filters.push("cl.post_rank = 1\n".to_string());
            // Runs staff removed from the WR history stay out of it unless asked for.
            if params.include_hidden_wr != Some(true) {
                filters.push("cl.wr_hidden = false\n".to_string());
            }
            // Pending runs don't count until they're verified.
            filters.push("cl.verified IS TRUE\n".to_string());
            // Banned runs (and runs by banned players) never held a world record, so hide them
            // unless asked for explicitly.
            if params.banned.is_none() {
                filters.push("cl.banned = 'false'\n".to_string());
                filters.push("u.banned IS NOT TRUE\n".to_string());
            }
        }
    }
    if let Some(verified) = params.verified {
        filters.push(if verified { "cl.verified IS TRUE\n" } else { "cl.verified IS NOT TRUE\n" }.to_string());
    }
    if let Some(banned) = params.banned {
        filters.push(format!("cl.banned = '{}'\n", banned));
    }
    // These values are interpolated into the SQL string, so only accept digits
    // (map IDs and Steam profile numbers are always numeric).
    let is_numeric = |s: &str| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit());
    if let Some(chamber) = params.chamber {
        if !is_numeric(&chamber) {
            return Err(sqlx::Error::RowNotFound);
        }
        filters.push(format!("cl.map_id = '{}'\n", &chamber));
    }
    if let Some(profile_number) = params.profile_number {
        if !is_numeric(&profile_number) {
            return Err(sqlx::Error::RowNotFound);
        }
        filters.push(format!("cl.profile_number = '{}'\n", &profile_number));
    } else if let Some(nick_name) = params.nick_name {
        let mut profile_numbers = Users::check_board_name(pool, &nick_name).await?;
        if !profile_numbers.is_empty()
        {
            if profile_numbers.len() == 1 {
                filters.push(format!(
                    "cl.profile_number = '{}'\n",
                    &profile_numbers[0].to_string()
                ));
            } else {
                let mut profile_str = format!(
                    "(cl.profile_number = '{}'\n",
                    &profile_numbers[0].to_string()
                );
                profile_numbers.remove(0);
                for num in profile_numbers.iter() {
                    profile_str.push_str(&format!(" OR cl.profile_number = '{}'\n", num));
                }
                profile_str.push(')');
                filters.push(profile_str);
            }
        } else {
            // An unknown name matches nothing rather than erroring.
            filters.push("1 = 0\n".to_string());
        }
    }
    if let Some(first) = params.first {
        filters.push(format!("cl.id > {}\n", &first));
    } else if let Some(last) = params.last {
        filters.push(format!("cl.id < {}\n", &last));
    }
    if let Some(additional_filters) = additional_filters {
        filters.append(additional_filters);
    }
    // Build the statement based off the elements we added to our vector (used to make sure only first statement is WHERE, and additional are OR)
    for (i, entry) in filters.iter().enumerate() {
        if i == 0 {
            query_string = format!("{} WHERE {}", query_string, entry);
        } else {
            query_string = format!("{} AND {}", query_string, entry);
        }
    }
    //TODO: Maybe allow for custom order params????
    query_string = format!("{} ORDER BY cl.timestamp DESC NULLS LAST\n", query_string);
    if let Some(limit) = params.limit {
        query_string = format!("{} LIMIT {}\n", query_string, limit);
    } else {
        // TODO: Update to use the correct
        query_string = format!("{} LIMIT 500\n", query_string);
    }
    Ok(query_string)
}

impl Default for ChangelogQueryParams {
    fn default() -> Self {
        ChangelogQueryParams {
            limit: Some(500),
            nick_name: None,
            profile_number: None,
            chamber: None,
            sp: Some(true),
            coop: Some(true),
            wr_gain: None,
            has_demo: None,
            banned: None,
            verified: None,
            include_hidden_wr: None,
            yt: None,
            first: None,
            last: None,
            game_id: None,
        }
    }
}

// TODO: Handle Autosubmit
impl ChangelogInsert {
    /// Create a [crate::models::changelog::ChangelogInsert] from a [crate::models::changelog::SubmissionChangelog]
    pub async fn new_from_submission(
        params: SubmissionChangelog,
        details: CalcValues,
        cache: &HashMap<String, i32>,
    ) -> ChangelogInsert {
        ChangelogInsert {
            timestamp: match NaiveDateTime::parse_from_str(&params.timestamp, "%Y-%m-%d %H:%M:%S") {
                Ok(val) => Some(val),
                Err(_) => None,
            },
            profile_number: params.profile_number.clone(),
            score: params.score,
            map_id: params.map_id.clone(),
            youtube_id: params.youtube_id,
            note: params.note,
            category_id: params.category_id.unwrap_or_else(|| cache[&params.map_id]),
            submission: 1,
            previous_id: details.previous_id,
            post_rank: details.post_rank,
            pre_rank: details.pre_rank,
            score_delta: details.score_delta,
            banned: false,
            verified: Some(false),
            ..Default::default()
        }
    }
}
