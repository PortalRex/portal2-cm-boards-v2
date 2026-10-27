use crate::{models::{changelog::MapScoreDate, points::*, users::*}, tools::error::{ServerError, ErrorType}};
use sqlx::PgPool;

impl Users {
    // TODO: Testing for this
    // TODO: Fix edge case parsing for steam user.
    /// Fetch a [Users] from the official Steam API.
    pub async fn new_from_steam(steam_api_key: &str, profile_number: &str) -> Result<Users, ServerError> {
        // http://steamcommunity.com/profiles/{}/?xml=1
        // GET https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/
        let steam_api_url = format!(
            "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key={}&steamids={}",
            steam_api_key, profile_number
        );
        // Errors without the URL: it holds the API key.
        let user = crate::tools::helpers::http_client()
            .get(&steam_api_url)
            .send()
            .await
            .map_err(reqwest::Error::without_url)?
            .json::<GetPlayerSummariesWrapper>()
            .await
            .map_err(reqwest::Error::without_url)?;
        if user.response.players.is_empty() {
            return Err(ServerError {
                error_message: format!("User not found"),
                error_type: ErrorType::Reqwest,
            });
        }
        Ok(Users {
            profile_number: profile_number.to_string(),
            board_name: None,
            steam_name: Some(user.response.players[0].personaname.clone()),
            banned: false,
            registered: 0,
            avatar: Some(user.response.players[0].avatarfull.clone()),
            steam_country: user.response.players[0].loccountrycode.clone(),
            ..Default::default()
        })
    }

    /// Gives a new account the country on its Steam profile (ISO code), unless it has one.
    pub async fn set_default_country(pool: &PgPool, profile_number: &str, steam_country: Option<&str>) -> Result<(), sqlx::Error> {
        let Some(code) = steam_country.filter(|c| !c.is_empty()) else {
            return Ok(());
        };
        sqlx::query("UPDATE users SET country_id = (SELECT id FROM countries WHERE upper(iso) = upper($2)) WHERE profile_number = $1 AND country_id IS NULL")
            .bind(profile_number)
            .bind(code)
            .execute(pool)
            .await?;
        Ok(())
    }
    /// Returns a [Users] from the given `profile_number`.
    #[allow(dead_code)]
    pub async fn get_user(pool: &PgPool, profile_number: String) -> Result<Option<Users>, sqlx::Error> {
        sqlx::query_as::<_, Users>(r#"SELECT * FROM users WHERE profile_number = $1"#)
            .bind(profile_number)
            .fetch_optional(pool)
            .await
    }
    /// Gets a [UsersPage] from a given `profile_number`.
    /// 
    /// Will favor `board_name` over `steam_name`.
    pub async fn get_user_data(pool: &PgPool, profile_number: &str) -> Result<Option<UsersPage>, sqlx::Error> {
        sqlx::query_as::<_, UsersPage>(
            r#"
                SELECT COALESCE(board_name, steam_name) AS user_name, avatar
                    FROM users
                    WHERE users.profile_number = $1
                "#,
        )
        .bind(profile_number)
        .fetch_optional(pool)
        .await
    }
    // TODO: There are faster ways to do this. <-----
    /// Pattern match on a given string to find similar names (supports board/steam names).
    pub async fn check_board_name(pool: &PgPool, nick_name: &str) -> std::result::Result<Vec<String>, sqlx::Error> {
        // Limitation to how SQLX inserts strings.
        let nick_name = format!("%{}%", &nick_name);
        sqlx::query_scalar(
            r#"
                SELECT users.profile_number FROM users
                WHERE 
                    CASE
                        WHEN users.board_name IS NULL
                            THEN LOWER(users.steam_name) LIKE LOWER($1)
                        WHEN users.board_name IS NOT NULL
                            THEN LOWER(users.board_name) LIKE LOWER($1)
                    END
                "#,
        )
        .bind(nick_name)
        .fetch_all(pool)
        .await
    }
    /// Returns a list of all banned player's `profile_numbers`.
    pub async fn get_banned(pool: &PgPool) -> Result<Vec<String>, sqlx::Error> {
        sqlx::query_scalar(r#"SELECT users.profile_number FROM users WHERE users.banned = True"#)
            .fetch_all(pool)
            .await
    }
    /// Returns a list of all banned player's as a [UsersDisplay].
    pub async fn get_banned_display(pool: &PgPool) -> Result<Vec<UsersDisplay>, sqlx::Error> {
        sqlx::query_as::<_, UsersDisplay>(
            r#" SELECT users.profile_number,
            COALESCE(users.board_name, users.steam_name, users.profile_number) as user_name, 
            users.avatar
                FROM users WHERE users.banned = 'true'"#,
        )
        .fetch_all(pool)
        .await
    }
    /// Returns the boolean flag associated with the user in the boards, if Err, assumed User does not exist.
    pub async fn check_banned(pool: &PgPool, profile_number: &str) -> Result<bool, sqlx::Error> {
        sqlx::query_scalar(r#"SELECT users.banned FROM users WHERE users.profile_number = $1"#)
            .bind(profile_number)
            .fetch_one(pool)
            .await
    }
    #[allow(dead_code)]
    /// Returns the title associated with the user.
    pub async fn get_title(pool: &PgPool, profile_number: String) -> Result<Option<String>, sqlx::Error> {
        sqlx::query_scalar(r#"SELECT title FROM users WHERE users.profile_number = $1"#)
            .bind(profile_number)
            .fetch_optional(pool)
            .await
    }
    #[allow(dead_code)]
    /// Returns a [Socials] associated with a given user's `profile_number`.
    pub async fn get_socials(pool: &PgPool, profile_number: String) -> Result<Option<Socials>, sqlx::Error> {
        sqlx::query_as::<_, Socials>(
            r#"
            SELECT twitch, youtube, discord_id 
            FROM users 
            WHERE profile_number = $1"#,
        )
        .bind(profile_number)
        .fetch_optional(pool)
        .await
    }
    #[allow(dead_code)]
    /// Returns the admin information associated with the user.
    pub async fn get_admin_for_user(pool: &PgPool, profile_number: String) -> Result<Option<i32>, sqlx::Error> {
        sqlx::query_scalar(r#"SELECT admin FROM users WHERE profile_number = $1"#)
            .bind(profile_number)
            .fetch_optional(pool)
            .await
    }
    /// Returns [UsersDisplay] for all admins.
    /// Usage:  admin_value = 0     -> Non-admin user
    ///         admin_value = 1     -> Standard admin
    ///         admin_value = 2     -> Shadow admin
    ///             (Has admin permissions, is not publically listed)
    ///             (Typically reserved for former admins, trusted players)
    ///         admin_value = 3     -> Developer admin
    ///             (Has admin permissions as an activen developer only)
    pub async fn get_all_admins(
        pool: &PgPool,
        admin_value: i32,
    ) -> Result<Vec<UsersDisplay>, sqlx::Error> {
            sqlx::query_as::<_, UsersDisplay>(
                r#"
                SELECT users.profile_number, 
                    COALESCE(users.board_name, users.steam_name, users.profile_number) AS user_name,
                    users.avatar
                FROM users
                WHERE users.admin = $1
                "#,
            )
            .bind(admin_value)
            .fetch_all(pool)
            .await
    }
    /// Everyone with a staff role (admin, moderator, verifier) who isn't banned: highest tier
    /// first, then by name.
    pub async fn get_staff(pool: &PgPool) -> Result<Vec<StaffMember>, sqlx::Error> {
        sqlx::query_as::<_, StaffMember>(
            r#"
            SELECT users.profile_number,
                COALESCE(users.board_name, users.steam_name, users.profile_number) AS user_name,
                users.avatar,
                users.role
            FROM users
            WHERE users.role IS NOT NULL AND NOT users.banned
            ORDER BY CASE users.role WHEN 'admin' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END,
                LOWER(COALESCE(users.board_name, users.steam_name, users.profile_number))
            "#,
        )
        .fetch_all(pool)
        .await
    }
    /// Returns all users that have donated to the board. Ordered by highest amount.
    pub async fn get_donators(pool: &PgPool) -> Result<Vec<Users>, sqlx::Error> {
        sqlx::query_as::<_, Users>(
            r#"
        SELECT * FROM users
            WHERE donation_amount IS NOT NULL
            ORDER BY CAST(donation_amount AS decimal) DESC;"#,
        )
        .fetch_all(pool)
        .await
    }
    /// Returns a [ProfileData] (Portal 2 maps) for the given `profile_number`.
    /// The player's oldest and newest Portal 2 personal bests, in single player and co-op (empty
    /// when they have none): their best run on each map, then the earliest and latest of those.
    pub async fn get_profile(pool: &PgPool, profile_number: &String) -> Result<ProfileData, sqlx::Error> {
        #[derive(sqlx::FromRow)]
        struct Pick {
            slot: String,
            #[sqlx(flatten)]
            run: MapScoreDate,
        }
        let picks = sqlx::query_as::<_, Pick>(
            r#"
            WITH pbs AS (
                SELECT DISTINCT ON (m.steam_id) m.steam_id AS map, m.name AS map_name, cl.score, cl.timestamp, c.is_multiplayer
                FROM changelog AS cl
                INNER JOIN maps AS m ON (cl.map_id = m.steam_id)
                INNER JOIN chapters AS c ON (m.chapter_id = c.id)
                WHERE cl.profile_number = $1
                  AND c.game_id = 1
                  AND cl.banned = 'false'
                  AND cl.verified = 'true'
                  AND cl.category_id = m.default_cat_id
                ORDER BY m.steam_id, cl.score, cl.timestamp
            ),
            dated AS (SELECT * FROM pbs WHERE timestamp IS NOT NULL)
            (SELECT 'oldest_sp' AS slot, map, map_name, score, timestamp FROM dated WHERE NOT is_multiplayer ORDER BY timestamp, map LIMIT 1)
            UNION ALL
            (SELECT 'newest_sp', map, map_name, score, timestamp FROM dated WHERE NOT is_multiplayer ORDER BY timestamp DESC, map LIMIT 1)
            UNION ALL
            (SELECT 'oldest_coop', map, map_name, score, timestamp FROM dated WHERE is_multiplayer ORDER BY timestamp, map LIMIT 1)
            UNION ALL
            (SELECT 'newest_coop', map, map_name, score, timestamp FROM dated WHERE is_multiplayer ORDER BY timestamp DESC, map LIMIT 1)
            "#,
        )
        .bind(profile_number)
        .fetch_all(pool)
        .await?;
        let mut data = ProfileData::default();
        for Pick { slot, run } in picks {
            match slot.as_str() {
                "oldest_sp" => data.oldest_sp = run,
                "newest_sp" => data.newest_sp = run,
                "oldest_coop" => data.oldest_coop = run,
                _ => data.newest_coop = run,
            }
        }
        Ok(data)
    }
    // TODO: Consider using profanity filter (only for really bad names): https://docs.rs/censor/latest/censor/
    /// Inserts a new user into the databse from a given [Users]. Returns the [Users] object.
    pub async fn insert_new_users(pool: &PgPool, new_user: Users) -> Result<Users, sqlx::Error> {
        let (profile_number, steam_country) = (new_user.profile_number.clone(), new_user.steam_country.clone());
        let inserted = Self::insert_user_row(pool, new_user).await?;
        Self::set_default_country(pool, &profile_number, steam_country.as_deref()).await?;
        Ok(inserted)
    }

    async fn insert_user_row(pool: &PgPool, new_user: Users) -> Result<Users, sqlx::Error> {
        // let mut res = String::new();
        // We do not care about the returning profile_number. As it is not generated and we already have it
        sqlx::query_as::<_, Users>(
            r#"
                INSERT INTO Users
                (profile_number, board_name, steam_name, banned, registered, 
                avatar, twitch, youtube, title, admin, donation_amount, discord_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING *"#,
        )
        .bind(new_user.profile_number)
        .bind(new_user.board_name)
        .bind(new_user.steam_name)
        .bind(new_user.banned)
        .bind(new_user.registered)
        .bind(new_user.avatar)
        .bind(new_user.twitch)
        .bind(new_user.youtube)
        .bind(new_user.title)
        .bind(new_user.admin)
        .bind(new_user.donation_amount)
        .bind(new_user.discord_id)
        .fetch_one(pool)
        .await
    }
    #[allow(dead_code)]
    /// Update a given user with a new [Users] object.
    pub async fn update_existing_user(pool: &PgPool, updated_user: Users) -> Result<Users, sqlx::Error> {
        // TODO: Check to make sure user has correct AUTH to update specific items
        // (board_name should only be changed by the backend, admin should only be updated by admin etc)
        sqlx::query_as::<_, Users>(
            r#"
                UPDATE users
                SET board_name = $1, steam_name = $2, banned = $3, registered = $4, 
                avatar = $5, twitch = $6, youtube = $7, title = $8, admin = $9,
                donation_amount = $10, discord_id = $11
                WHERE profile_number = $12 RETURNING *"#,
        )
        .bind(updated_user.board_name)
        .bind(updated_user.steam_name)
        .bind(updated_user.banned)
        .bind(updated_user.registered)
        .bind(updated_user.avatar)
        .bind(updated_user.twitch)
        .bind(updated_user.youtube)
        .bind(updated_user.title)
        .bind(updated_user.admin)
        .bind(updated_user.donation_amount)
        .bind(updated_user.discord_id)
        .bind(updated_user.profile_number)
        .fetch_one(pool)
        .await
    }
    /// Returns the **PREVIOUS** `avatar` after updating.
    pub async fn update_avatar(
        pool: &PgPool,
        profile_number: &str,
        avatar: &str,
    ) -> Result<String, sqlx::Error> {
        sqlx::query_scalar(
            r#"WITH old AS (
                SELECT avatar FROM users WHERE profile_number = $2
            )
            UPDATE users SET avatar = CASE WHEN avatar_locked OR avatar_custom THEN avatar ELSE $1 END
                WHERE profile_number = $2 RETURNING (SELECT avatar FROM old)"#,
        )
        .bind(avatar)
        .bind(profile_number)
        .fetch_one(pool)
        .await
    }
    #[allow(dead_code)]
    /// Deletion for a given `profile_number`.
    pub async fn delete_user(pool: &PgPool, profile_number: String) -> Result<Users, sqlx::Error> {
        sqlx::query_as::<_, Users>(
            r#"DELETE FROM users 
                WHERE profile_number = $1 RETURNING *"#,
        )
        .bind(profile_number)
        .fetch_one(pool)
        .await
    }
}

impl ProfileScore {
    /// The player's best verified, unbanned time on each Portal 2 map (default category), with the
    /// partner on co-op maps.
    pub async fn get_profile_scores(pool: &PgPool, profile_number: &str) -> Result<Vec<ProfileScore>, sqlx::Error> {
        sqlx::query_as::<_, ProfileScore>(
            r#"
            SELECT DISTINCT ON (pb.map_id) pb.map_id, pb.score, pb.timestamp, pb.changelog_id, pb.is_multiplayer,
                    pu.profile_number AS partner_profile_number,
                    COALESCE(pu.board_name, pu.steam_name, pu.profile_number) AS partner_name,
                    pu.avatar AS partner_avatar
                FROM (
                    -- The player's own runs.
                    SELECT cl.map_id, cl.score, cl.timestamp, cl.id AS changelog_id, c.is_multiplayer, cl.coop_id
                        FROM changelog AS cl
                        INNER JOIN maps AS m ON (m.steam_id = cl.map_id)
                        INNER JOIN chapters AS c ON (c.id = m.chapter_id)
                        WHERE cl.profile_number = $1
                        AND c.game_id = 1
                        AND cl.banned = 'false'
                        AND cl.verified = 'true'
                        AND cl.category_id = m.default_cat_id
                    UNION ALL
                    -- Co-op runs where the player's half is the 'N/A' placeholder (they have no row of
                    -- their own; the bundle names them): the run is their partner's half, as on the board.
                    SELECT r.map_id, r.score, r.timestamp, r.id, c.is_multiplayer, cb.id
                        FROM changelog AS ph
                        INNER JOIN coop_bundled AS cb ON (ph.id IN (cb.cl_id1, cb.cl_id2))
                        INNER JOIN changelog AS r ON (r.id IN (cb.cl_id1, cb.cl_id2) AND r.id <> ph.id)
                        INNER JOIN maps AS m ON (m.steam_id = r.map_id)
                        INNER JOIN chapters AS c ON (c.id = m.chapter_id)
                        WHERE ph.profile_number = 'N/A'
                        AND $1 IN (cb.p_id1, cb.p_id2)
                        AND r.profile_number <> $1
                        AND c.game_id = 1
                        AND r.banned = 'false'
                        AND r.verified = 'true'
                        AND r.category_id = m.default_cat_id
                ) AS pb
                LEFT JOIN coop_bundled AS b ON (b.id = pb.coop_id)
                LEFT JOIN users AS pu ON (pu.profile_number = CASE WHEN b.p_id1 = $1 THEN b.p_id2 ELSE b.p_id1 END)
                -- A co-op run counts once both halves are verified and neither half nor player is
                -- banned, as on the co-op map page and in points: a faster run with a banned partner
                -- isn't the profile's PB (it has no rank, and its row on the board is someone else's).
                -- Players are checked as the bundle names them too: a partner without a run of their
                -- own has the 'N/A' placeholder as their half.
                WHERE pb.coop_id IS NULL OR NOT EXISTS (
                    SELECT 1 FROM coop_bundled AS cb
                        JOIN changelog AS o ON o.id IN (cb.cl_id1, cb.cl_id2)
                        JOIN users AS ou ON ou.profile_number IN (o.profile_number, cb.p_id1, cb.p_id2)
                    WHERE cb.id = pb.coop_id AND (NOT o.verified OR o.banned OR ou.banned)
                )
                ORDER BY pb.map_id, pb.score ASC, pb.timestamp ASC
            "#,
        )
        .bind(profile_number)
        .fetch_all(pool)
        .await
    }
}
