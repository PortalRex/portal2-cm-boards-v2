/// Caching for endpoints
/// Steam sign-in sessions and request authorization
pub mod auth;
pub mod cache;
/// Configuration module that handles extracting information from the environment for setup.
pub mod config;
/// Helper functions used accross different modules
pub mod helpers;
/// Server-computed aggregated points boards
pub mod points_cache;
/// Players' points over time
pub mod points_history;
/// Locating demo files for download
pub mod demo_files;
pub mod demo_parse;
pub mod ratelimit;
pub mod old_boards_sync;
pub mod private_site;
/// The background jobs' last runs (admin page)
pub mod jobs;
/// Live updates for the staff inbox
pub mod staff_events;
pub mod steam_sync;
/// Discord announcements of new world records, one webhook per game
pub mod wr_webhooks;

pub mod error;