use chrono::NaiveDateTime;
use sqlx::FromRow;

/// One-to-one struct for map data.
#[derive(Serialize, Deserialize, Debug, FromRow)]
pub struct Maps {
    pub id: i32,
    pub steam_id: String,
    pub lp_id: String,
    pub name: String,
    pub chapter_id: Option<i32>,
    pub default_cat_id: i32,
    pub is_public: bool,
}

/// One-to-one struct for Category data.
#[derive(Serialize, Deserialize, Debug, FromRow)]
pub struct Categories {
    pub id: i32,
    pub name: String,
    pub map_id: String,
    pub rules_id: Option<i32>,
    pub updated: Option<NaiveDateTime>,
}

/// One-to-one struct for category rules.
#[derive(Serialize, Deserialize, Debug, FromRow)]
pub struct CategoryRules {
    pub id: i32,
    pub rules: Option<String>,
    pub external_link: Option<String>,
    pub is_active: Option<bool>,
    pub updated: Option<NaiveDateTime>,
}

/// Handles game id and if the request is for a coop or singleplayer map.
#[derive(Deserialize, Debug)]
pub struct IsCoop {
    pub is_coop: bool,
    pub game_id: Option<i32>,
}

/// A world record from before the boards' own history (`old_wrs`): shown in the map's WR history
/// only, as no one's run here.
#[derive(Serialize, Deserialize, Debug, FromRow)]
pub struct OldWr {
    pub id: i32,
    pub map_id: String,
    pub score: i32,
    pub set_at: NaiveDateTime,
    /// false: only the day is known (or, with `date_estimated`, only the month).
    pub time_known: bool,
    pub date_estimated: bool,
    pub player_name: String,
    pub profile_number: Option<String>,
    pub note: Option<String>,
    pub source: String,
}
