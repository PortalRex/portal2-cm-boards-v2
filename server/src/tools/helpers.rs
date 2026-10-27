use anyhow::{bail, Result};
use num::pow;
use sqlx::PgPool;
use std::collections::{HashMap, HashSet};

use crate::models::changelog::{CalcValues, Changelog, ChangelogInsert, SubmissionChangelog};
use crate::models::coop::{CoopMap, CoopRanked};
use crate::models::maps::Maps;
use crate::models::sp::SpMap;
use crate::models::users::Users;

use super::cache::CacheState;
use super::config::Config;

pub type Transaction<'a> = sqlx::Transaction<'a, sqlx::Postgres>;

/// Calcultes the score using the pre-existing iVerb point formula.
#[inline(always)]
pub fn score(i: i32) -> f32 {
    if i > 200 {
        0.0
    } else {
        let i = i as f32;
        let res: f32 = pow(200.0 - (i - 1.0), 2) / 200.0;
        if 1.0 > res {
            1.0
        } else {
            res
        }
    }
}

/// Grabs the default category IDs for all maps as a HashMap.
pub async fn get_default_cat_ids(pool: &PgPool) -> HashMap<String, i32> {
    Maps::get_all_default_cats(pool).await.unwrap()
}

/// Filters out all obsolete times from the result, keeping the runs ranked within `limit` (everyone
/// tied at the cutoff stays on, as on single player boards).
pub async fn filter_coop_entries(coop_entries: Vec<CoopMap>, limit: usize) -> Vec<CoopRanked> {
    rank_coop_entries(coop_entries, limit, crate::tools::config::coop_by_run())
}

fn rank_coop_entries(coop_entries: Vec<CoopMap>, limit: usize, by_run: bool) -> Vec<CoopRanked> {
    let mut ranked = filter_coop_entries_raw(coop_entries);
    // Ranking by run: runs with the same time share a rank, like single player.
    if by_run {
        for i in 1..ranked.len() {
            if ranked[i].map_data.score == ranked[i - 1].map_data.score {
                ranked[i].rank = ranked[i - 1].rank;
                ranked[i].points = ranked[i - 1].points;
            }
        }
    }
    // The cutoff is a rank, not a count: a tie across it doesn't drop the later runs in it.
    let keep = ranked.partition_point(|r| r.rank as usize <= limit);
    ranked.truncate(keep);
    ranked
}

fn filter_coop_entries_raw(coop_entries: Vec<CoopMap>) -> Vec<CoopRanked> {
    let mut coop_entries_filtered = Vec::new();
    let mut remove_dups: HashSet<String> = HashSet::with_capacity(coop_entries.len());
    remove_dups.insert("N/A".to_string());
    let mut i = 1;
    for entry in coop_entries.into_iter() {
        match remove_dups.insert(entry.profile_number1.clone()) {
            // If player 1 has a better time, check to see if player 2 doesn't.
            false => match remove_dups.insert(entry.profile_number2.clone()) {
                false => (),
                true => {
                    coop_entries_filtered.push(CoopRanked {
                        map_data: entry.clone(),
                        rank: i,
                        points: score(i),
                    });
                    i += 1;
                }
            },
            // This case handles if player 1 doesn't have a better time, and it tries to add player 2 in as well, if two has a better time or not, this is included.
            true => match remove_dups.insert(entry.profile_number2.clone()) {
                false => {
                    coop_entries_filtered.push(CoopRanked {
                        map_data: entry.clone(),
                        rank: i,
                        points: score(i),
                    });
                    i += 1;
                }
                true => {
                    coop_entries_filtered.push(CoopRanked {
                        map_data: entry.clone(),
                        rank: i,
                        points: score(i),
                    });
                    i += 1;
                }
            },
        }
    }
    coop_entries_filtered
}

/// Checks if a score is valid, if it is, returns post_rank, pre_rank, score_delta, previous_id
pub async fn check_for_valid_score(
    pool: &PgPool,
    cl: &SubmissionChangelog,
    limit: i32,
) -> Result<CalcValues> {
    let mut values = CalcValues::default();
    match Users::check_banned(pool, &cl.profile_number).await {
        Ok(b) => {
            if b {
                values.banned = true;
                return Ok(values);
            }
        }
        Err(e) => {
            // Assuming someone is manually/automatically submitting a demo, a user account should be created for them on the boards.
            // TODO: Maybe this changes when AUTH changes?
            eprintln!("User assumed not found -> {:?}", e);
            bail!("User does not exist");
        }
    }
    let cl_res = Changelog::get_sp_pb_history(
        pool,
        &cl.profile_number,
        &cl.map_id,
        cl.category_id.unwrap(),
        cl.game_id.unwrap_or(1),
    )
    .await;
    let cl_res = match cl_res {
        Ok(x) => {
            if x.is_empty() {
                return Ok(values);
            } else {
                x
            }
        }
        Err(e) => {
            eprintln!("Error with sp pb history -> {:?}", e);
            eprintln!("Assume there is not sp_pb_histroy for the player.");
            return Ok(values);
        }
    };

    if cl_res[0].score <= cl.score {
        bail!("Current score is the same, or better.")
    }
    values.score_delta = Some(cl_res[0].score - cl.score);
    values.previous_id = Some(cl_res[0].id);
    // Assuming there is a PB History, there must be other scores, this should return a valid list of ranked maps.
    let cl_ranked = SpMap::get_sp_map_page(
        pool,
        &cl.map_id,
        limit,
        cl.category_id.unwrap(),
        cl.game_id.unwrap_or(1),
        None,
    )
    .await
    .unwrap();
    for (i, entry) in cl_ranked.iter().enumerate() {
        if entry.score >= cl.score {
            values.post_rank = Some(i as i32 + 1);
        }
        if entry.profile_number == cl.profile_number {
            values.pre_rank = Some(i as i32 + 1);
        }
    }
    Ok(values)
}

/// Returns a ChangelogInsert that should be valid to insert.
///
/// Checks for a past score on the map for the user.
///
/// Score is invalid if any of the following are true
/// 1. The user is banned.
/// 2. The user has a time on the same map, with the same score (time).
/// 3. The user does not exist (and cannot be added from Steam).
///
/// This function handles the error case where the user is valid on steam, but does not currently exist in our database.
pub async fn get_valid_changelog_insert(
    pool: &PgPool,
    config: &Config,
    cache: &CacheState,
    mut cl: SubmissionChangelog,
) -> Result<ChangelogInsert> {
    if cl.category_id.is_none() {
        cl.category_id = Some(cache.default_cat_ids[&cl.map_id]);
    } // Steps 1 & 2
    let values = match check_for_valid_score(pool, &cl, config.proof.results).await {
        Ok(details) => {
            if details.banned {
                bail!("User is banned");
            } else {
                details
            }
        }
        Err(e) => {
            // Step 3
            eprintln!("Error checking valid score details -> {e}");
            // Try to insert the user into the users table.
            match Users::new_from_steam(&config.steam.api_key, &cl.profile_number).await {
                Ok(user) => match Users::insert_new_users(pool, user).await {
                    Ok(_) => CalcValues::default(),
                    _ => bail!("Could not add new user to database."),
                },
                Err(e) => {
                    eprintln!("Could not get user from steam -> {e}");
                    bail!("Invalid user steam_id provided.");
                }
            }
        }
    };
    // Step 4
    Ok(ChangelogInsert::new_from_submission(cl, values, &cache.default_cat_ids).await)
}

/// The game a map belongs to (1, Portal 2, if it's unknown).
/// A moment from a query: a day (YYYY-MM-DD, meaning its end, UTC) or a time (ISO, UTC; a
/// trailing Z or fraction is fine).
pub fn parse_moment(input: &str) -> Option<chrono::NaiveDateTime> {
    let s = input.trim().trim_end_matches('Z');
    if let Ok(d) = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        return d.and_hms_opt(23, 59, 59);
    }
    chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.f").ok()
}

pub async fn map_game_id(pool: &PgPool, map_id: &str) -> i32 {
    sqlx::query_scalar::<_, i32>("SELECT c.game_id FROM maps AS m JOIN chapters AS c ON c.id = m.chapter_id WHERE m.steam_id = $1")
        .bind(map_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .unwrap_or(1)
}

/// One HTTP client for calls to Steam and the like (connection pool and TLS set-up are shared,
/// rather than built per request).
pub fn http_client() -> &'static reqwest::Client {
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .user_agent("p2cm-boards")
            .build()
            .expect("http client")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A co-op run by two players with the given time.
    fn run(p1: &str, p2: &str, score: i32) -> CoopMap {
        CoopMap {
            coop_id: 0,
            cl_id1: 0,
            cl_id2: 0,
            timestamp: None,
            profile_number1: p1.to_string(),
            profile_number2: p2.to_string(),
            score,
            p1_is_host: None,
            demo_id1: None,
            demo_id2: None,
            youtube_id1: None,
            youtube_id2: None,
            submission1: 0,
            submission2: 0,
            note1: None,
            note2: None,
            category_id: 0,
            user_name1: p1.to_string(),
            user_name2: Some(p2.to_string()),
            avatar1: None,
            avatar2: None,
            autorender_id1: None,
            autorender_id2: None,
            portals1: None,
            portals2: None,
            sar_version1: None,
            sar_version2: None,
        }
    }

    fn ranks(ranked: &[CoopRanked]) -> Vec<(i32, i32)> {
        ranked.iter().map(|r| (r.map_data.score, r.rank)).collect()
    }

    #[test]
    fn coop_cutoff_keeps_everyone_tied_at_it() {
        let board = || vec![run("a", "b", 100), run("c", "d", 200), run("e", "f", 200), run("g", "h", 200), run("i", "j", 300)];
        // Ranked by run, the three 2.00 runs share 2nd: a cutoff at 2 keeps all of them (4 runs).
        assert_eq!(ranks(&rank_coop_entries(board(), 2, true)), vec![(100, 1), (200, 2), (200, 2), (200, 2)]);
        // By player, every run has its own rank, so the cutoff is a count.
        assert_eq!(ranks(&rank_coop_entries(board(), 2, false)), vec![(100, 1), (200, 2)]);
        assert_eq!(rank_coop_entries(board(), 10, true).len(), 5);
    }
}
