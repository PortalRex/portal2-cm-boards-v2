/// Admin-specific endpoints.
pub mod admin;
/// Steam sign-in and sessions.
pub mod auth;
/// Changelog-specific endpoints.
pub mod changelog;
/// Chapter-related endpoints.
pub mod chapters;
/// Cooperative-specific endpoints.
pub mod coop;
/// Demo endpoints
///pub mod demos;
/// Full-game (speedrun.com-style) board endpoints.
pub mod fullgame;
/// Per-game aggregate endpoints computed from the changelog.
pub mod game_boards;
/// Mounting of the endpoints.
pub mod init;
/// Maps-based endpoints.
pub mod maps;
/// Admin actions (audit-logged).
pub mod moderation;
/// Point-based endpoints.
pub mod points;
/// Per-run endpoints (co-op halves, reactions).
pub mod runs;
/// Singleplayer-specific endpoints.
pub mod sp;
/// Run submissions.
pub mod submissions;
/// The game catalog and its admin editor.
pub mod catalog;
/// Anonymous run reports.
pub mod reports;
/// Endpoints for usefull statistics
pub mod stats;
/// User-related endpoints.
pub mod users;
