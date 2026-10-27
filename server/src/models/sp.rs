use super::changelog::Changelog;
use chrono::NaiveDateTime;
use sqlx::FromRow;

/// The minimal data we want for SP map pages to lower bandwidth usage.
#[derive(Serialize, FromRow, Debug)]
pub struct SpMap {
    /// Changelog ID of the run (used by the frontend to find autorender videos).
    pub cl_id: i64,
    pub timestamp: Option<NaiveDateTime>,
    #[sqlx(rename = "cl_profile_number")]
    pub profile_number: String,
    pub score: i32,
    pub demo_id: Option<i64>,
    pub youtube_id: Option<String>,
    pub submission: i32,
    pub note: Option<String>,
    pub category_id: i32,
    pub user_name: Option<String>,
    pub avatar: Option<String>,
    /// Autorender share ID of the run's rendered video, if any.
    pub autorender_id: Option<String>,
    /// Portals placed, read from the demo.
    pub portals: Option<i16>,
    /// SAR version the demo was recorded with.
    pub sar_version: Option<String>,
}

/// The data for the preview page for all SP Maps
#[derive(Serialize, Deserialize, FromRow)]
pub struct SpPreview {
    #[sqlx(rename = "cl_profile_number")]
    pub profile_number: String,
    pub score: i32,
    pub youtube_id: Option<String>,
    pub category_id: i32,
    pub user_name: String,
    pub map_id: String,
    /// Autorender share ID of the run's rendered video, if any.
    pub autorender_id: Option<String>,
    /// The run's demo, if any (so the map list can offer it for download).
    #[serde(default)]
    pub demo_id: Option<i64>,
}

/// Wrapper for multiple SpPreviews, prevents repeat data (multiple map_name and map_id copies)
// #[derive(Serialize, Deserialize)]
// pub struct SpPreviews {
//     pub map_id: String,
//     pub scores: Vec<SpPreview>,
// }

/// Wrapper for a player's SP PB history.
#[derive(Serialize, Deserialize)]
pub struct SpPbHistory {
    pub user_name: Option<String>,
    pub avatar: Option<String>,
    pub pb_history: Option<Vec<Changelog>>,
}
/// Wrapper for the sp map data and the rank/score.
#[derive(Serialize)]
pub struct SpRanked {
    pub map_data: SpMap,
    pub rank: i32,
    pub points: f32,
}

/// Banned times for SP
#[derive(Serialize, FromRow)]
pub struct SpBanned {
    pub profile_number: String,
    pub score: i32,
}
