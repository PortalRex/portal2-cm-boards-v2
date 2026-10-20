use sqlx::FromRow;

/// One-to-one struct for user data.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow, Default)]
pub struct Users {
    pub profile_number: String,
    pub board_name: Option<String>,
    pub steam_name: Option<String>,
    pub banned: bool,
    pub registered: i32,
    pub avatar: Option<String>,
    pub twitch: Option<String>,
    pub youtube: Option<String>,
    pub title: Option<String>,
    pub admin: i32,
    pub donation_amount: Option<String>,
    /// Private: never sent in API responses.
    #[serde(skip_serializing)]
    pub discord_id: Option<String>,
    /// Private (the old boards' per-user submission key): never sent in API responses.
    #[serde(skip_serializing)]
    pub auth_hash: Option<String>,
    pub country_id: Option<i32>,
    /// Frozen profiles keep their times but can't get new ones.
    #[sqlx(default)]
    pub frozen: bool,
    #[sqlx(default)]
    pub frozen_reason: Option<String>,
    /// Staff tier: verifier, moderator or admin.
    #[sqlx(default)]
    pub role: Option<String>,
    #[sqlx(default)]
    #[serde(default)]
    pub name_locked: bool,
    #[sqlx(default)]
    #[serde(default)]
    pub avatar_locked: bool,
    /// The player chose their own picture (kept through sign-ins).
    #[sqlx(default)]
    #[serde(default)]
    pub avatar_custom: bool,
    /// When the player's peak points first reached Legends (kept for good), if they have.
    #[sqlx(default)]
    #[serde(default)]
    pub legends_at: Option<chrono::NaiveDateTime>,
    /// The country on the player's Steam profile (ISO code), when read from Steam: a new
    /// account starts with it ([Users::set_default_country]). Not stored as such.
    #[sqlx(skip)]
    #[serde(skip)]
    pub steam_country: Option<String>,
}

/// One-to-one struct for countries
#[derive(Serialize, Deserialize, FromRow, Clone, Debug)]
pub struct Countries {
    id: i32,
    iso: String,
    name: String,
    nicename: String,
    iso3: String,
    numcode: i32,
    phonecode: i32,
}

/// One-to-one struct for countries
#[derive(Serialize, Deserialize, FromRow, Clone, Debug)]
pub struct CountriesMin {
    id: i32,
    iso3: String,
    nicename: String,
}

/// Includes only a `user_name` and `avatar`, does not include the `profile_number`
///
/// Used for when the `profile_number` is included in another portion of the returned values.
#[derive(Debug, FromRow, Deserialize, Serialize, Clone)]
pub struct UsersPage {
    pub user_name: String,
    pub avatar: String,
}

/// Wraps `profile_number`, `user_name` and `avatar` for displaying a user.
#[derive(Debug, FromRow, Deserialize, Serialize, Clone)]
pub struct UsersDisplay {
    pub profile_number: String,
    pub user_name: String,
    pub avatar: String,
}

/// A member of staff for the public team list: name, picture and staff tier.
#[derive(Debug, FromRow, Deserialize, Serialize, Clone)]
pub struct StaffMember {
    pub profile_number: String,
    pub user_name: String,
    pub avatar: Option<String>,
    /// "admin", "moderator" or "verifier".
    pub role: String,
}

#[derive(Debug, Deserialize, Serialize, Clone, FromRow)]
pub struct UsersDisplayCount {
    pub profile_number: String,
    pub user_name: String,
    pub avatar: String,
    pub count: i64,
}

/// Social media accounts from `Users`
#[derive(Serialize, Deserialize, Debug, FromRow)]
pub struct Socials {
    pub twitch: Option<String>,
    pub youtube: Option<String>,
    pub discord_id: Option<String>,
}

/// An avatar being added to the db.
#[derive(Clone, Debug, Deserialize)]
pub struct AvatarInsert {
    pub avatar: String,
}

/// Wrapper for our API call
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GetPlayerSummariesWrapper {
    pub response: Players,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Players {
    pub players: Vec<GetPlayerSummaries>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GetPlayerSummaries {
    pub steamid: String,
    pub communityvisibilitystate: i32,
    pub profilestate: i32,
    pub personaname: String,
    pub lastlogoff: i32,
    pub profileurl: String,
    pub avatar: String,
    pub avatarmedium: String,
    pub avatarfull: String,
    /// The country on the Steam profile (ISO code), if public.
    #[serde(default)]
    pub loccountrycode: Option<String>,
}

/// A player's personal best on a Portal 2 map, with deltas against the ranked board.
#[derive(Serialize, Deserialize, FromRow, Debug, Clone)]
pub struct ProfileScore {
    pub map_id: String,
    pub score: i32,
    pub timestamp: Option<chrono::NaiveDateTime>,
    pub changelog_id: i64,
    pub is_multiplayer: bool,
    /// Rank within the top results (`None` when outside them).
    #[sqlx(skip)]
    pub rank: Option<i32>,
    /// Centiseconds behind the world record (0 for the record itself).
    #[sqlx(skip)]
    pub delta_to_wr: Option<i32>,
    /// Centiseconds behind the next better distinct time (`None` for the record).
    #[sqlx(skip)]
    pub delta_to_next: Option<i32>,
}
