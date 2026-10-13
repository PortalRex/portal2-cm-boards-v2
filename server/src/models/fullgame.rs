//! Full-game (speedrun.com-style) leaderboards: games, categories, levels, variables,
//! runners and runs. Mirrors the fg_* tables.
use chrono::{NaiveDate, NaiveDateTime};
use sqlx::FromRow;

#[derive(Serialize, Debug, FromRow, Clone)]
pub struct FgGame {
    pub id: i32,
    pub slug: String,
    pub name: String,
    pub src_id: Option<String>,
    pub sort: i32,
}

#[derive(Serialize, Debug, FromRow, Clone)]
pub struct FgCategory {
    pub id: i32,
    pub game_id: i32,
    pub slug: String,
    pub name: String,
    /// `full_game` or `per_level`.
    #[sqlx(rename = "type")]
    #[serde(rename = "type")]
    pub kind: String,
    pub players: i16,
    pub rules: Option<String>,
    /// Demos required through this rank; `None` = always.
    pub demo_rank: Option<i32>,
    pub video_required: bool,
    pub miscellaneous: bool,
    pub src_id: Option<String>,
    pub sort: i32,
}

#[derive(Serialize, Debug, FromRow, Clone)]
pub struct FgLevel {
    pub id: i32,
    pub game_id: i32,
    pub slug: String,
    pub name: String,
    pub src_id: Option<String>,
    pub sort: i32,
}

#[derive(Serialize, Debug, FromRow, Clone)]
pub struct FgVariableValue {
    pub id: i32,
    pub variable_id: i32,
    pub label: String,
    pub slug: String,
    pub sort: i32,
}

#[derive(Serialize, Debug, FromRow, Clone)]
pub struct FgVariable {
    pub id: i32,
    pub game_id: i32,
    pub category_id: Option<i32>,
    pub level_id: Option<i32>,
    pub name: String,
    /// `global`, `full_game`, `all_levels` or `single_level`.
    pub scope: String,
    /// Subcategory variables split a leaderboard (SLA / No SLA); others are run attributes.
    pub is_subcategory: bool,
    pub mandatory: bool,
    pub sort: i32,
    #[sqlx(skip)]
    pub values: Vec<FgVariableValue>,
}

/// A run with its category, game and level names.
#[derive(Serialize, Debug, FromRow, Clone)]
pub struct FgRunRow {
    pub id: i32,
    pub category_id: i32,
    pub level_id: Option<i32>,
    pub time_ms: i32,
    pub run_date: Option<NaiveDate>,
    pub submitted_at: NaiveDateTime,
    pub status: String,
    pub examiner_name: Option<String>,
    pub examined_at: Option<NaiveDateTime>,
    pub reject_reason: Option<String>,
    pub comment: Option<String>,
    pub video_url: Option<String>,
    pub demo_url: Option<String>,
    /// Whether an uploaded demo archive exists (the file path itself is not exposed).
    pub has_demo_file: bool,
    pub src_id: Option<String>,
    pub category_name: String,
    pub category_slug: String,
    pub players: i16,
    pub category_type: String,
    pub game_id: i32,
    pub game_name: String,
    pub game_slug: String,
    pub level_name: Option<String>,
    pub level_slug: Option<String>,
}

#[derive(Serialize, Debug, FromRow, Clone)]
pub struct FgRunRunner {
    #[serde(skip)]
    pub run_id: i32,
    pub position: i16,
    pub id: i32,
    pub name: String,
    pub profile_number: Option<String>,
    pub avatar: Option<String>,
}

#[derive(Serialize, Debug, FromRow, Clone)]
pub struct FgRunValue {
    #[serde(skip)]
    pub run_id: i32,
    pub variable_id: i32,
    pub variable: String,
    pub is_subcategory: bool,
    pub value_id: i32,
    pub label: String,
    pub slug: String,
}

/// A run with its runners and variable values, and its place on the board when ranked.
#[derive(Serialize, Debug, Clone)]
pub struct FgRun {
    #[serde(flatten)]
    pub run: FgRunRow,
    pub runners: Vec<FgRunRunner>,
    pub values: Vec<FgRunValue>,
    pub rank: Option<i32>,
    pub obsolete: bool,
}

#[derive(Serialize, Debug, FromRow, Clone)]
pub struct FgRunEvent {
    pub action: String,
    pub note: Option<String>,
    pub created_at: NaiveDateTime,
    pub actor_name: Option<String>,
}

#[derive(Serialize, Debug, FromRow, Clone)]
pub struct FgRunner {
    pub id: i32,
    pub profile_number: Option<String>,
    pub src_user_id: Option<String>,
    pub src_guest_name: Option<String>,
    pub name: String,
    pub avatar: Option<String>,
}

/// A game with its categories.
#[derive(Serialize, Debug)]
pub struct FgGameSummary {
    #[serde(flatten)]
    pub game: FgGame,
    pub categories: Vec<FgCategory>,
}

/// A game page: categories and levels.
#[derive(Serialize, Debug)]
pub struct FgGamePage {
    pub game: FgGame,
    pub categories: Vec<FgCategory>,
    pub levels: Vec<FgLevel>,
}

/// A leaderboard: one category (and level) filtered to one value per subcategory variable.
#[derive(Serialize, Debug)]
pub struct FgBoard {
    pub game: FgGame,
    pub category: FgCategory,
    pub level: Option<FgLevel>,
    /// Levels to choose from (per-level categories).
    pub levels: Vec<FgLevel>,
    pub variables: Vec<FgVariable>,
    /// Selected value slug per subcategory variable id.
    pub selected: std::collections::BTreeMap<i32, String>,
    pub runs: Vec<FgRun>,
}

#[derive(Serialize, Debug)]
pub struct FgRunPage {
    #[serde(flatten)]
    pub run: FgRun,
    pub events: Vec<FgRunEvent>,
}

#[derive(Serialize, Debug)]
pub struct FgRunnerPage {
    pub runner: FgRunner,
    pub runs: Vec<FgRun>,
}
