//! # Overview
//! 
//! The controllers for database interactions are implementations on associated data [models](crate::models).
//! 
//! ## Admin
//! Admin controllers are implemented on [crate::models::admin::Admin].
//! 
//! ## Changelog
//! Changelog controllers are implmented on the following:
//! 
//! - [crate::models::changelog::Changelog]
//!     - For primarily database interactions for the changelog entries.
//! - [crate::models::changelog::ChangelogPage]
//!     - For rendering changelog pages.
//!
//!  There are some helper methods reused among the implementations found in the changelog model itself.
//!
//! ## Chapters
//! Chapter controllers are implemented on [crate::models::chapters].
//! 
//! There are some helper methods reused among the implementations found in the chapter model itself.
//! 
//! ## Coop
//! Coop controllers are implemented on the following:
//! 
//! - [crate::models::coop::CoopBundled]
//!     - Database interactions.
//! - [crate::models::coop::CoopMap]
//!     - To create a map page.
//! - [crate::models::coop::CoopPreview]
//!     - For the coop preview page on the boards.
//! - [crate::models::coop::CoopBanned]
//!     - To handle information on banned coop times.
//! 
//! ## Demos
//! Demo controllers are implemented on [crate::models::demos::Demos].
//! 
//! Mtrigger controllers are also defined in this file, implemented on [crate::models::demos::Mtriggers].
//! 
//! ## Maps
//! Map controllers are implemented on [crate::models::maps::Maps].
//! 
//! ## Single Player (sp)
//! SP controllers are implemented on the following:
//! 
//! - [crate::models::sp::SpMap]
//!     - For SP Map Page generation.
//! - [crate::models::sp::SpPreview]
//!     - For SP Previews.
//! - [crate::models::sp::SpBanned]
//!     - For SP Banned data.
//! 
//! 
//! ## Stats
//! Controllers for deriving information for stats are implemented on the following:
//! 
//! - [crate::models::changelog::NumScores]
//!     - For counting the number of scores overall/per-map
//! - [crate::models::changelog::Recap]
//!     - For generating recaps.
//! 
//! ## Users
//! Controllers for users are implemented on [crate::models::users::Users].
//! 
/// Controllers for admin-specific functions
pub mod admin;
/// Steam sign-in: users, sessions, replay guard
pub mod auth;
/// Controllers for changelog
pub mod changelog;
/// Controllers for chapters
pub mod chapters;
/// Controllers for coop
pub mod coop;
/// Controllers for demos
pub mod demos;
/// Per-game aggregates computed from the changelog (points, ranks)
pub mod game_boards;
/// Controllers for maps
pub mod maps;
/// Admin actions with an audit log
pub mod moderation;
/// Co-op halves and reactions on runs
pub mod runs;
/// Controllers for sp
pub mod sp;
/// Controllers for stats
pub mod stats;
/// Run submissions from demos
pub mod submissions;
/// Games, seasons, chapters, maps and categories
pub mod catalog;
/// Player stats (activity, partners, demo stats)
pub mod profile_stats;
/// Site-wide runner statistics (the Stats page).
pub mod site_stats;
/// Anonymous run reports
pub mod reports;
/// Staff-only notes on runs
pub mod staff_notes;
/// Controllers for users
pub mod users;
