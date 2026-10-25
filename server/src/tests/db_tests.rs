// use actix_web::{test, HttpRequest, HttpResponse, HttpMessage};
// use actix_web::http::{header, StatusCode};
use sqlx::PgPool;
use dotenv::dotenv;
use anyhow::Result;
use crate::tools::config::Config;

#[allow(dead_code)]
const DEFAULT_PAGE_SIZE: usize = 500;

#[allow(dead_code)]
async fn get_config() -> Result<(Config, PgPool)> {
    dotenv().ok();
    let config = Config::from_env()?;
    let pool = PgPool::connect(&config.database_url).await?;
    Ok((config, pool))
}

#[actix_web::test]
async fn test_db_maps() {
    use crate::models::maps::*;
    let (_, pool) = get_config().await.expect("Error getting config and DB pool");
    let sp = Maps::get_steam_ids(&pool, false, 1).await.unwrap();
    let coop = Maps::get_steam_ids(&pool, true, 1).await.unwrap();
    assert_eq!(sp.len(), 60);
    assert_eq!(coop.len(), 48);
    let map_name = Maps::get_map_name(&pool, sp[0].clone()).await.unwrap().unwrap();
    let pgun = "Portal Gun".to_string();
    assert_eq!(map_name, pgun);
    let default_cat = Maps::get_default_cat(&pool, sp[0].clone()).await.unwrap().unwrap();
    assert_eq!(default_cat, 49);
    let chapter_id = Maps::get_chapter_from_map_id(&pool, sp[0].clone()).await.unwrap().unwrap();
    assert_eq!(chapter_id.id, 7);
    assert_eq!(chapter_id.chapter_name, Some("The Courtesy Call".to_string()));
    let id = Maps::get_steam_id_by_name(&pool, pgun.clone()).await.unwrap();
    assert_eq!(sp[0], id[0]);
    let public = Maps::get_is_public_by_steam_id(&pool, sp[0].clone()).await.unwrap().unwrap();
    assert!(public);
}

#[actix_web::test]
async fn test_db_chapters() {
    use crate::models::chapters::*;
    let (_, pool) = get_config().await.expect("Error getting config and DB pool");
    let chapter = Chapters {
        id: 7,
        chapter_name: Some("The Courtesy Call".to_string()),
        is_multiplayer: false,
        game_id: 1,
    };
    let map_ids = Chapters::get_map_ids(&pool, chapter.id).await.unwrap();
    assert_eq!(vec!["47458", "47455", "47452", "47106", "47735", "62761", "62758", "62763", "62759"], map_ids);
    let chapters_query_params = ChapterQueryParams {
        chapter_name: Some("the courtesy".to_string()),
        is_multiplayer: Some(false),
        game_id: Some(1),
    };
    let ids = Chapters::get_filtered_chapters(&pool, chapters_query_params).await.unwrap();
    assert_eq!(7, ids[0].id);
    let new_chapter = Chapters::get_chapter_by_id(&pool, chapter.id).await.unwrap().unwrap();
    assert_eq!(chapter.id, new_chapter.id);
    assert_eq!(chapter.chapter_name, new_chapter.chapter_name);
    assert_eq!(chapter.is_multiplayer, new_chapter.is_multiplayer);
    assert_eq!(chapter.game_id, new_chapter.game_id);
    let is_mp = Chapters::get_chapter_is_multiplayer(&pool, chapter.id).await.unwrap().unwrap();
    assert_eq!(chapter.is_multiplayer, is_mp);
    let game = Chapters::get_chapter_game(&pool, chapter.id).await.unwrap().unwrap();
    assert_eq!(chapter.game_id, game.id);
}


// TODO: We want to make this prone to handling changes, right now many of the tests
//       are hard-coded to only work on this current version of the db.
#[actix_web::test]
async fn test_db_users() {
    use crate::models::users::*;
    let (_, pool) = get_config().await.expect("Error getting config and DB pool");
    
    let user: Users = Users{ 
        profile_number: "76561198040982247".to_string(),
        board_name: Some("Daniel".to_string()),
        steam_name: Some("BigDaniel".to_string()),
        banned: false,
        registered: 0,
        avatar: Some("https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/92/921d9d7402a6e766759bcc0b2ac7b91f1dcf0ad2_full.jpg".to_string()),
        twitch: Some("bigdaniel".to_string()),
        youtube: Some("/channel/UCtwF46_PUGCefgRfrcIXOZA".to_string()),
        title: Some("Sysadmin".to_string()),
        admin: 1,
        donation_amount: None,
        discord_id: None,
        auth_hash: None,
        country_id: None,
        frozen: false,
        frozen_reason: None,
        role: None,
        name_locked: false,
        avatar_locked: false,
        avatar_custom: false,
        ..Default::default()
    };
    let mut insert_user = user.clone();
    let test_user = Users::get_user(&pool, user.profile_number.clone()).await.unwrap().unwrap();
    assert_eq!(user.profile_number, test_user.profile_number);
    assert_eq!(user.board_name, test_user.board_name);
    assert_eq!(user.steam_name, test_user.steam_name);
    assert_eq!(user.banned, test_user.banned);
    assert_eq!(user.registered, test_user.registered);
    assert_eq!(user.avatar, test_user.avatar);
    assert_eq!(user.twitch, test_user.twitch);
    assert_eq!(user.youtube, test_user.youtube);
    assert_eq!(user.title, test_user.title);
    assert_eq!(user.admin, test_user.admin);
    assert_eq!(user.donation_amount, test_user.donation_amount);
    assert_eq!(user.discord_id, test_user.discord_id);
    let test_user = Users::get_user_data(&pool, &user.profile_number).await.unwrap().unwrap();
    assert_eq!(user.board_name, Some(test_user.user_name));
    assert_eq!(user.avatar, Some(test_user.avatar));
    let test_vec = Users::check_board_name(&pool, "Daniel").await.unwrap();
    assert!(test_vec.len() != 0);
    let banned = Users::get_banned(&pool).await.unwrap();
    assert!(banned.len() > 148);
    let banned = Users::check_banned(&pool, &user.profile_number).await.unwrap();
    assert!(!banned);
    let title = Users::get_title(&pool, user.profile_number.clone()).await.unwrap();
    assert_eq!(user.title, title);
    let socials = Users::get_socials(&pool, user.profile_number.clone()).await.unwrap().unwrap();
    assert_eq!(user.twitch, socials.twitch);
    assert_eq!(user.youtube, socials.youtube);
    assert_eq!(user.discord_id, socials.discord_id);
    let admin = Users::get_admin_for_user(&pool, user.profile_number.clone()).await.unwrap().unwrap();
    assert_eq!(user.admin, admin);
    let admin_vec = Users::get_all_admins(&pool, 1).await.unwrap();
    assert_eq!(admin_vec.len(), 8);
    insert_user.profile_number = "0".to_string();
    
    // Test inserts/updates/deletes
    Users::insert_new_users(&pool, insert_user.clone()).await.unwrap();
    let insert_user_data = Users::get_user_data(&pool, &insert_user.profile_number).await.unwrap().unwrap();
    assert_eq!(insert_user.board_name, Some(insert_user_data.user_name));
    assert_eq!(insert_user.avatar, Some(insert_user_data.avatar));
    insert_user.board_name = Some("BigDaniel11AtlasPog".to_string());
    Users::update_existing_user(&pool, insert_user.clone()).await.unwrap();
    let new_avi = Users::update_avatar(&pool, &user.profile_number, user.avatar.as_ref().unwrap()).await.unwrap();
    assert_eq!(new_avi, user.avatar.unwrap());
    Users::delete_user(&pool, insert_user.profile_number.clone()).await.unwrap();
    let _res = Users::get_user_data(&pool, &insert_user.profile_number).await;

    // Donations
    let donators = Users::get_donators(&pool).await.unwrap();
    assert!(!donators.is_empty());
}

#[actix_web::test]
async fn test_db_demos() {
    use crate::models::demos::*;
    use crate::models::changelog::{Changelog, ChangelogInsert};
    use chrono::NaiveDateTime;
    let (_, pool) = get_config().await.expect("Error getting config and DB pool");

    let demo = Demos {
        id: 14607,
        file_id: "LaservsTurret_1763_76561198040982247_14607.dem".to_string(),
        partner_name: None,
        parsed_successfully: true,
        sar_version: None,
        cl_id: 127825,
        updated: None,
    };
    let demo_by_cl_id = Demos::get_demo_by_cl_id(&pool, demo.cl_id).await.unwrap().unwrap();

    let new_demo = Demos::get_demo(&pool, demo_by_cl_id.id).await.unwrap().unwrap();

    assert_eq!(demo_by_cl_id.id, new_demo.id);
    assert_eq!(demo.file_id, new_demo.file_id);
    assert_eq!(demo.partner_name, new_demo.partner_name);
    assert_eq!(demo.parsed_successfully, new_demo.parsed_successfully);
    assert_eq!(demo.sar_version, new_demo.sar_version);
    assert_eq!(demo.cl_id, new_demo.cl_id);

    let fid = Demos::get_demo_file_id(&pool, demo.id).await.unwrap().unwrap();
    assert_eq!(demo.file_id, fid);
    let partner_name = Demos::get_partner_name(&pool, demo.id).await.unwrap();
    assert_eq!(demo.partner_name, partner_name);
    let parsed = Demos::check_parsed(&pool, demo.id).await.unwrap();
    assert_eq!(demo.parsed_successfully, parsed);
    let sar_version = Demos::get_sar_version(&pool, demo.id).await.unwrap();
    assert_eq!(demo.sar_version, sar_version);
    let new_demo = DemoInsert {
        file_id: "Doors_831_76561198039230536.dem".to_string(),
        partner_name: Some("Undead".to_string()),
        parsed_successfully: false,
        sar_version: Some("12.7.2-pre".to_string()),
        cl_id: 1,
    };
    let demo_insert = Demos::insert_demo(&pool, new_demo.clone()).await.unwrap();
    let clinsert = ChangelogInsert {
        timestamp: Some(NaiveDateTime::parse_from_str("2020-10-16 12:11:56", "%Y-%m-%d %H:%M:%S").unwrap()),
        profile_number: "76561198040982247".to_string(),
        score: 1698,
        map_id: "47763".to_string(),
        demo_id: Some(demo_insert),
        banned: false,
        youtube_id: None,
        previous_id: Some(127825),
        coop_id: None,
        post_rank: Some(1),
        pre_rank: Some(3),
        submission: 1,
        note: None,
        category_id: 19,
        score_delta: Some(-65),
        verified: Some(true),
        admin_note: None,
    };
    let mut check_insert = Demos::get_demo(&pool, demo_insert).await.unwrap().unwrap();
    assert_eq!(demo_insert, check_insert.id);
    assert_eq!(new_demo.file_id, check_insert.file_id);
    assert_eq!(new_demo.partner_name, check_insert.partner_name);
    assert_eq!(new_demo.parsed_successfully, check_insert.parsed_successfully);
    assert_eq!(new_demo.sar_version, check_insert.sar_version);
    assert_eq!(new_demo.cl_id, check_insert.cl_id);
    // Testing deleting demos from changelog entries.    
    let new_cl_id = Changelog::insert_changelog(&pool, clinsert.clone()).await.unwrap();
    let new_fid = "Hello World".to_string();
    check_insert.file_id = new_fid.clone();
    // Update the demo
    Demos::update_demo(&pool, check_insert.clone()).await.unwrap();
    let check_updated = Demos::get_demo(&pool, check_insert.id).await.unwrap().unwrap();
    assert_eq!(check_updated.file_id, new_fid);
    // Delete references to the demo entry.
    let updated_cl = Changelog::delete_references_to_demo(&pool, clinsert.demo_id.unwrap()).await.unwrap();
    assert_eq!(updated_cl[0], new_cl_id);
    // Delete the demo entry
    Demos::delete_demo(&pool, check_insert.id).await.unwrap();
    let _res = Demos::get_demo(&pool, check_insert.id).await;
    // Delete the changelog entry
    let _ = Changelog::delete_changelog(&pool, new_cl_id).await.unwrap();
}

#[actix_web::test]
async fn test_db_changelog() {
    use crate::models::changelog::*;
    use chrono::NaiveDateTime;
    let (_, pool) = get_config().await.expect("Error getting config and DB pool");
    let mut transaction = pool.begin().await.unwrap();
    #[allow(unused_variables)]
    let changelog = Changelog {
        id: 127825,
        timestamp: Some(NaiveDateTime::parse_from_str("2020-10-16 12:11:56", "%Y-%m-%d %H:%M:%S").unwrap()),
        profile_number: "76561198040982247".to_string(),
        score: 1763,
        map_id: "47763".to_string(),
        demo_id: Some(14598),
        banned: false,
        youtube_id: Some("-InZK6yZb08?start=0".to_string()),
        previous_id: Some(113132),
        coop_id: None,
        post_rank: Some(1),
        pre_rank: Some(3),
        submission: 0,
        note: None,
        category_id: 19,
        score_delta: Some(-83),
        verified: Some(true),
        admin_note: None,
        updated: None,
    };

    let clinsert = ChangelogInsert {
        timestamp: Some(NaiveDateTime::parse_from_str("2020-10-16 12:11:56", "%Y-%m-%d %H:%M:%S").unwrap()),
        profile_number: "76561198040982247".to_string(),
        score: 1698,
        map_id: "47763".to_string(),
        demo_id: None,
        banned: false,
        youtube_id: None,
        previous_id: Some(127825),
        coop_id: None,
        post_rank: Some(1),
        pre_rank: Some(3),
        submission: 1,
        note: None,
        category_id: 19,
        score_delta: Some(-65),
        verified: Some(true),
        admin_note: None,
    };
    
    let banned_scores = Changelog::check_banned_scores(&pool, ScoreLookup {
        map_id: "47763".to_string(),
        score: 1763,
        profile_number: "76561198040982247".to_string(),
        cat_id: Some(67),
        game_id: Some(1)
    }).await.unwrap();
    assert!(!banned_scores);
    let pb_history = Changelog::get_sp_pb_history(&pool, "76561198040982247", "47763", 67, 1).await.unwrap();
    assert_ne!(0, pb_history.len());
    // Insert, update and delete a row (the transaction_* versions of these were removed in fe740fa).
    let new_id = Changelog::insert_changelog(&pool, clinsert.clone()).await.unwrap();
    let mut new_cl_insert = Changelog::get_changelog(&pool, new_id).await.unwrap().unwrap();
    new_cl_insert.note = Some("fat time".to_string());
    let _ = Changelog::update_changelog(&pool, new_cl_insert.clone()).await.unwrap();
    let _ = Changelog::delete_changelog(&pool, new_id).await.unwrap();
    let _res = Changelog::get_changelog(&pool, new_id).await;

    let query_params = ChangelogQueryParams {
        limit: Some(500),
        nick_name: None,
        profile_number: None,
        chamber: None,
        sp: None,
        coop: None,
        wr_gain: None,
        has_demo: None,
        banned: None,
        include_hidden_wr: None,
        yt: None,
        first: None,
        last: None,
        game_id: None,
        ..Default::default()
    };

    // ChangelogPage
    let cl_page = ChangelogPage::get_changelog_page(&pool, query_params).await.unwrap();
    assert_eq!(cl_page.len(), DEFAULT_PAGE_SIZE);
    let filter = ChangelogQueryParams {
        limit: Some(200),
        nick_name: Some("Daniel".to_string()),
        profile_number: None,
        chamber: Some("47763".to_string()),
        sp: Some(true),
        coop: Some(true),
        wr_gain: Some(true),
        has_demo: Some(true),
        banned: None,
        include_hidden_wr: None,
        yt: None,
        first: None,
        last: None,
        game_id: None,
        ..Default::default()
    };
    let filtered_cl_page = ChangelogPage::get_changelog_page(&pool, filter).await.unwrap();
    assert_eq!(filtered_cl_page.len(), 1);
    assert_eq!(filtered_cl_page[0].id, 127825);
    transaction.rollback().await.unwrap();
}

#[actix_web::test]
async fn test_db_pages() {
    use crate::models::sp::*;
    use crate::models::coop::*;    
    use crate::tools::helpers::{filter_coop_entries, score};
    let (config, pool) = get_config().await.expect("Error getting config and DB pool");

    let sp_map_id = "47763".to_string();
    let coop_map_id = "52642".to_string();
    let smp = SpMap::get_sp_map_page(&pool, &sp_map_id, DEFAULT_PAGE_SIZE as i32, 67, 1, None).await.unwrap();
    assert_ne!(smp.len(), 0);
    let cmp = CoopMap::get_coop_map_page(&pool, &coop_map_id, 21, 1, None).await.unwrap();
    assert_ne!(cmp.len(), 0);
    let coop_entries_filtered = filter_coop_entries(cmp, config.proof.results as usize).await;
    // Ensure we didn't mess up the ranking/points algorithm.
    for i in 0..coop_entries_filtered.len() {
        assert_eq!((i + 1) as i32, coop_entries_filtered[i].rank);
        assert_eq!(score((i + 1) as i32), coop_entries_filtered[i].points);
        if i == 0 {             // Point check for the first entry.
            assert_eq!(200.0, coop_entries_filtered[i].points);
        } else if i == 149 {    // Point check for the 150th entry.
            assert_eq!(13.005, coop_entries_filtered[i].points);
        } else if i == 200 {    // Point check for the 201st entry.
            assert_eq!(0.0, coop_entries_filtered[i].points)
        }
    }

    let sppres = SpPreview::get_sp_previews(&pool, 1).await.unwrap();
    assert_eq!(sppres.len(), 60);
    let cooppres = CoopPreview::get_coop_previews(&pool, 1).await.unwrap();
    assert_eq!(cooppres.len(), 48);

    let _spbanned = SpBanned::get_sp_banned(&pool, sp_map_id).await.unwrap();
    let _coopbanned = CoopBanned::get_coop_banned(&pool, &coop_map_id, 19).await.unwrap();
}

#[actix_web::test]
async fn test_db_admins() {
    use crate::models::admin::*;
    use crate::models::changelog::ChangelogQueryParams;
    let (_, pool) = get_config().await.expect("Error getting config and DB pool.");
    let query_params = ChangelogQueryParams {
        limit: Some(5),
        nick_name: None,
        profile_number: None,
        chamber: None,
        sp: None,
        coop: None,
        wr_gain: None,
        has_demo: None,
        banned: None,
        include_hidden_wr: None,
        yt: None,
        first: None,
        last: None,
        game_id: None,
        ..Default::default()
    };
    let ban_page = Admin::get_admin_page(&pool, query_params).await.unwrap().unwrap();
    assert!(ban_page.len() == 5);

    let ban_stats = Admin::get_user_banned_time_stats(&pool).await.unwrap().unwrap();
    assert!(!ban_stats.is_empty());
}
#[actix_web::test]
async fn test_db_staff_list() {
    use crate::models::users::*;
    let (_, pool) = get_config().await.expect("Error getting config and DB pool");
    // Our own rows (removed again at the end): one per tier, plus a banned admin who isn't listed.
    let rows = [
        ("test-staff-v", "aaa verifier", "verifier", false),
        ("test-staff-m", "zzz moderator", "moderator", false),
        ("test-staff-a2", "Bbb admin", "admin", false),
        ("test-staff-a1", "aaa admin", "admin", false),
        ("test-staff-banned", "banned admin", "admin", true),
    ];
    let cleanup = || sqlx::query("DELETE FROM users WHERE profile_number LIKE 'test-staff-%'").execute(&pool);
    cleanup().await.unwrap();
    for (id, name, role, banned) in rows {
        sqlx::query("INSERT INTO users (profile_number, steam_name, role, banned) VALUES ($1, $2, $3, $4)")
            .bind(id)
            .bind(name)
            .bind(role)
            .bind(banned)
            .execute(&pool)
            .await
            .unwrap();
    }
    let staff = Users::get_staff(&pool).await;
    cleanup().await.unwrap();
    let ours: Vec<(String, String)> = staff
        .unwrap()
        .into_iter()
        .filter(|s| s.profile_number.starts_with("test-staff-"))
        .map(|s| (s.profile_number, s.role))
        .collect();
    // Admins first (by name, ignoring case), then moderators, then verifiers; banned staff left out.
    let expected = [("test-staff-a1", "admin"), ("test-staff-a2", "admin"), ("test-staff-m", "moderator"), ("test-staff-v", "verifier")];
    assert_eq!(ours, expected.map(|(a, b)| (a.to_string(), b.to_string())));
}

#[actix_web::test]
async fn test_db_audit_search() {
    use crate::controllers::moderation::{list_actions, AuditQuery};
    let (_, pool) = get_config().await.expect("Error getting config and DB pool");
    // Our own rows (removed again at the end): a staff member, a player, and three actions.
    let cleanup = || async {
        sqlx::query("DELETE FROM admin_actions WHERE admin_profile = 'test-audit-staff'").execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM users WHERE profile_number IN ('test-audit-staff', 'test-audit-player')").execute(&pool).await.unwrap();
    };
    cleanup().await;
    for (id, name) in [("test-audit-staff", "Zyx Staffer"), ("test-audit-player", "Qwv Player")] {
        sqlx::query("INSERT INTO users (profile_number, steam_name) VALUES ($1, $2)").bind(id).bind(name).execute(&pool).await.unwrap();
    }
    let mut ids = vec![];
    for (action, target_type, target_id, reason, details) in [
        ("ban_user", "profile", "test-audit-player", Some("spliced 100% demo"), "{}"),
        ("update_map", "map", "test-audit-map", None, r#"{"name": "Qqq Chamber"}"#),
        // A deleted run keeps a copy of itself (on Wall Button, 47804).
        ("delete_run", "run", "999999999999", None, r#"{"runs": [{"profile_number": "test-audit-player", "map_id": "47804", "score": 3711}]}"#),
    ] {
        let id: i64 = sqlx::query_scalar(
            "INSERT INTO admin_actions (admin_profile, action, target_type, target_id, reason, details) VALUES ('test-audit-staff', $1, $2, $3, $4, $5::jsonb) RETURNING id",
        )
        .bind(action)
        .bind(target_type)
        .bind(target_id)
        .bind(reason)
        .bind(details)
        .fetch_one(&pool)
        .await
        .unwrap();
        ids.push(id);
    }
    // Which of our actions a search finds (other rows in the table may match too).
    let found = |q: &str| {
        let q = q.to_string();
        let (pool, ids) = (pool.clone(), ids.clone());
        async move {
            let rows = list_actions(&pool, &AuditQuery { q: Some(q), limit: Some(200), ..Default::default() }).await.unwrap();
            ids.iter().map(|id| rows.iter().any(|r| r.id == *id)).collect::<Vec<_>>()
        }
    };
    assert_eq!(found("zyx STAF").await, [true, true, true], "the staff member's name");
    assert_eq!(found("qwv").await, [true, false, true], "the profile's and the deleted run's player");
    assert_eq!(found("qqq chamber").await, [false, true, false], "a catalog change's details");
    assert_eq!(found("wall button").await, [false, false, true], "the deleted run's map");
    assert_eq!(found("100%").await, [true, false, false], "the reason, % as itself");
    assert_eq!(found("100_").await, [false, false, false], "_ as itself");
    assert_eq!(found("999999999999").await, [false, false, true], "a run id");
    assert_eq!(found("test-audit-player").await, [true, false, true], "a Steam id");
    assert_eq!(found("  ").await, [true, true, true], "blank: no search");
    // The search goes with the other filters.
    let profiles = list_actions(&pool, &AuditQuery { q: Some("qwv".into()), kind: Some("profiles".into()), limit: Some(200), ..Default::default() }).await.unwrap();
    assert!(profiles.iter().any(|r| r.id == ids[0]) && !profiles.iter().any(|r| r.id == ids[2]));
    cleanup().await;
}

#[actix_web::test]
async fn test_db_freeze_rules() {
    use crate::controllers::moderation::{set_frozen, Refused};
    use crate::tools::auth::{AdminOrService, AuthUser};
    let (_, pool) = get_config().await.expect("Error getting config and DB pool");
    // Our own rows (removed again at the end).
    let cleanup = || async {
        sqlx::query("DELETE FROM admin_actions WHERE target_id LIKE 'test-freeze-%'").execute(&pool).await.unwrap();
        sqlx::query("DELETE FROM users WHERE profile_number LIKE 'test-freeze-%'").execute(&pool).await.unwrap();
    };
    cleanup().await;
    for (id, role) in [("test-freeze-verifier", Some("verifier")), ("test-freeze-admin", Some("admin")), ("test-freeze-player", None)] {
        sqlx::query("INSERT INTO users (profile_number, steam_name, role) VALUES ($1, $1, $2)").bind(id).bind(role).execute(&pool).await.unwrap();
    }
    let staff = |id: &str, role: &str| {
        AdminOrService::Admin(AuthUser { profile_number: id.into(), user_name: id.into(), avatar: None, admin: 0, role: Some(role.into()), banned: false })
    };
    let (verifier, admin) = (staff("test-freeze-verifier", "verifier"), staff("test-freeze-admin", "admin"));
    let refused = |r: Result<(), Refused>| matches!(r, Err(Refused::Invalid(_)));
    assert!(refused(set_frozen(&pool, &verifier, "test-freeze-verifier", true, None).await.unwrap()), "not on themselves");
    assert!(refused(set_frozen(&pool, &verifier, "test-freeze-admin", true, None).await.unwrap()), "a verifier on an admin");
    assert!(set_frozen(&pool, &verifier, "test-freeze-player", true, None).await.unwrap().is_ok(), "a verifier on a player");
    assert!(set_frozen(&pool, &admin, "test-freeze-verifier", true, None).await.unwrap().is_ok(), "an admin on staff");
    let frozen: Vec<String> = sqlx::query_scalar("SELECT profile_number FROM users WHERE profile_number LIKE 'test-freeze-%' AND frozen ORDER BY 1").fetch_all(&pool).await.unwrap();
    assert_eq!(frozen, ["test-freeze-player", "test-freeze-verifier"]);
    cleanup().await;
}

#[actix_web::test]
async fn test_db_wr_webhooks() {
    use crate::tools::wr_webhooks::{check, PostError};
    use serde_json::Value;
    use std::sync::{Arc, Mutex};
    let (_, pool) = get_config().await.expect("Error getting config and DB pool");
    // Our own rows (removed again at the end); the games' webhooks and the announcer's start are put back.
    let saved: Vec<(i32, Option<String>)> = sqlx::query_as("SELECT id, wr_webhook_url FROM games").fetch_all(&pool).await.unwrap();
    let after: i64 = sqlx::query_scalar("SELECT after_id FROM wr_announcer_state").fetch_one(&pool).await.unwrap();
    let cleanup = || async {
        for sql in [
            "DELETE FROM legacy_changelog_ids WHERE changelog_id IN (SELECT id FROM changelog WHERE profile_number LIKE 'test-wr-%')",
            "UPDATE changelog SET coop_id = NULL WHERE profile_number LIKE 'test-wr-%'",
            "DELETE FROM coop_bundled WHERE mirror_of IN (SELECT id FROM coop_bundled WHERE p_id1 LIKE 'test-wr-%')",
            "DELETE FROM coop_bundled WHERE p_id1 LIKE 'test-wr-%'",
            "DELETE FROM changelog WHERE mirror_of IN (SELECT id FROM changelog WHERE profile_number LIKE 'test-wr-%')",
            "DELETE FROM changelog WHERE profile_number LIKE 'test-wr-%'",
            "DELETE FROM users WHERE profile_number LIKE 'test-wr-%'",
        ] {
            sqlx::query(sql).execute(&pool).await.unwrap();
        }
    };
    cleanup().await;
    sqlx::query("UPDATE wr_announcer_state SET after_id = (SELECT max(id) FROM changelog)").execute(&pool).await.unwrap();
    sqlx::query("UPDATE games SET wr_webhook_url = NULL").execute(&pool).await.unwrap();
    sqlx::query("UPDATE games SET wr_webhook_url = 'https://discord.com/api/webhooks/1/portal2' WHERE id = 1").execute(&pool).await.unwrap();
    for (id, banned) in [("test-wr-a", false), ("test-wr-b", false), ("test-wr-banned", true), ("test-wr-blue", false), ("test-wr-orange", false)] {
        sqlx::query("INSERT INTO users (profile_number, steam_name, banned) VALUES ($1, $1, $2)").bind(id).bind(banned).execute(&pool).await.unwrap();
    }
    // Runs on Laser Stairs (single player) and Turret Assassin (co-op), in their default categories.
    let run = |who: &'static str, map: &'static str, cat: i32, score: i32, verified: bool| {
        let pool = pool.clone();
        async move {
            sqlx::query_scalar::<_, i64>(
                "INSERT INTO changelog (timestamp, profile_number, score, map_id, banned, submission, category_id, verified) VALUES (now(), $1, $2, $3, false, 1, $4, $5) RETURNING id",
            )
            .bind(who)
            .bind(score)
            .bind(map)
            .bind(cat)
            .bind(verified)
            .fetch_one(&pool)
            .await
            .unwrap()
        }
    };
    // What a check posts (webhook, body), answering each post with the next queued result (else Ok).
    let sent: Arc<Mutex<Vec<(String, Value)>>> = Arc::default();
    let answers: Arc<Mutex<Vec<Result<(), PostError>>>> = Arc::default();
    let send = |url: String, body: Value| {
        let (sent, answers) = (sent.clone(), answers.clone());
        async move {
            let answer = answers.lock().unwrap().pop().unwrap_or(Ok(()));
            if answer.is_ok() {
                sent.lock().unwrap().push((url, body));
            }
            answer
        }
    };
    let field = |body: &Value, i: usize| body["embeds"][0]["fields"][i]["value"].as_str().unwrap().to_string();
    let posted = || sent.lock().unwrap().drain(..).map(|(url, body)| (url, field(&body, 0), field(&body, 1))).collect::<Vec<_>>();
    let marked = |id: i64| {
        let pool = pool.clone();
        async move { sqlx::query_scalar::<_, bool>("SELECT posted FROM wr_announcements WHERE changelog_id = $1").bind(id).fetch_optional(&pool).await.unwrap() }
    };

    // A new WR is posted to Portal 2's webhook; slower, banned and unverified runs aren't.
    let wr = run("test-wr-a", "47736", 54, 1, true).await;
    let slower = run("test-wr-b", "47736", 54, 2, true).await;
    let banned = run("test-wr-banned", "47736", 54, 1, true).await;
    let pending = run("test-wr-b", "47736", 54, 1, false).await;
    check(&pool, "https://b", send).await.unwrap();
    let p = posted();
    assert_eq!(p.len(), 1, "{p:?}");
    assert_eq!(p[0].0, "https://discord.com/api/webhooks/1/portal2");
    // The improvement is over the map's best time before this run (the real WR), not later runs.
    // (Banned players' runs don't count; the test data has some junk ones at i32::MIN.)
    let before: i32 = sqlx::query_scalar(
        "SELECT min(cl.score) FROM changelog AS cl JOIN users AS u ON u.profile_number = cl.profile_number WHERE cl.map_id = '47736' AND cl.category_id = 54 AND cl.verified AND NOT cl.banned AND NOT u.banned AND cl.id < $1",
    )
        .bind(wr)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(p[0].1, format!("0.01 (-{})", crate::controllers::submissions::format_time(before - 1)));
    assert!(p[0].2.contains("test-wr-a"), "{p:?}");
    assert_eq!((marked(wr).await, marked(slower).await, marked(banned).await, marked(pending).await), (Some(true), Some(false), Some(false), None));
    check(&pool, "https://b", send).await.unwrap();
    assert!(posted().is_empty(), "nothing twice");

    // A tie: Discord busy the first time (kept for the next check), then posted once.
    let tie = run("test-wr-b", "47736", 54, 1, true).await;
    answers.lock().unwrap().push(Err(PostError::Retry("429".into())));
    check(&pool, "https://b", send).await.unwrap();
    assert!(posted().is_empty() && marked(tie).await.is_none());
    check(&pool, "https://b", send).await.unwrap();
    let p = posted();
    assert_eq!((p.len(), p[0].1.as_str()), (1, "0.01 (tie)"));

    // Refused by Discord: not tried again. From the old boards' sync: never posted.
    let refused = run("test-wr-a", "47736", 54, 0, true).await;
    answers.lock().unwrap().push(Err(PostError::Refused("404".into())));
    check(&pool, "https://b", send).await.unwrap();
    assert_eq!(marked(refused).await, Some(false));
    let synced = run("test-wr-b", "47736", 54, -1, true).await;
    sqlx::query("INSERT INTO legacy_changelog_ids (game_id, legacy_id, changelog_id) VALUES (1, -1, $1)").bind(synced).execute(&pool).await.unwrap();
    check(&pool, "https://b", send).await.unwrap();
    assert!(posted().is_empty());
    assert_eq!(marked(synced).await, Some(false));

    // A co-op WR: one post naming both players.
    let (h1, h2) = (run("test-wr-blue", "52642", 21, 1, true).await, run("test-wr-orange", "52642", 21, 1, true).await);
    let coop: i64 = sqlx::query_scalar(
        "INSERT INTO coop_bundled (p_id1, p_id2, p1_is_host, cl_id1, cl_id2) VALUES ('test-wr-blue', 'test-wr-orange', true, $1, $2) RETURNING id",
    )
    .bind(h1)
    .bind(h2)
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query("UPDATE changelog SET coop_id = $1 WHERE id IN ($2, $3)").bind(coop).bind(h1).bind(h2).execute(&pool).await.unwrap();
    check(&pool, "https://b", send).await.unwrap();
    let p = posted();
    assert_eq!(p.len(), 1, "{p:?}");
    assert!(p[0].2.contains("test-wr-blue") && p[0].2.contains("test-wr-orange"), "{p:?}");

    // A game without a webhook posts nothing, and its runs aren't posted later when one is added.
    sqlx::query("UPDATE games SET wr_webhook_url = NULL WHERE id = 1").execute(&pool).await.unwrap();
    let quiet = run("test-wr-a", "47736", 54, -2, true).await;
    check(&pool, "https://b", send).await.unwrap();
    sqlx::query("UPDATE games SET wr_webhook_url = 'https://discord.com/api/webhooks/1/portal2' WHERE id = 1").execute(&pool).await.unwrap();
    check(&pool, "https://b", send).await.unwrap();
    assert!(posted().is_empty());
    assert_eq!(marked(quiet).await, Some(false));

    cleanup().await;
    for (id, url) in saved {
        sqlx::query("UPDATE games SET wr_webhook_url = $2 WHERE id = $1").bind(id).bind(url).execute(&pool).await.unwrap();
    }
    sqlx::query("UPDATE wr_announcer_state SET after_id = $1").bind(after).execute(&pool).await.unwrap();
}

#[actix_web::test]
async fn test_db_points_timeline_in_time_order() {
    let (_, pool) = get_config().await.expect("Error getting config and DB pool");
    // The points history, look-back and aggregated tables sweep each map's runs oldest first.
    for game in [1, 2] {
        assert!(crate::tools::points_history::runs_in_time_order(&pool, game).await.unwrap(), "game {game}");
    }
}

#[actix_web::test]
async fn test_db_old_boards_deletes_duplicate_steam_copies() {
    use crate::tools::old_boards_sync::{delete_duplicates, BoardReport};
    use std::collections::HashSet;
    let (_, pool) = get_config().await.expect("Error getting config and DB pool");
    // Our own rows (removed again at the end): two players' runs on Turret Intro, Doors and Buttons (co-op).
    let cleanup = || async {
        for sql in [
            "DELETE FROM admin_actions WHERE target_type = 'run' AND (target_id IN (SELECT id::text FROM changelog WHERE profile_number LIKE 'test-dup-%') OR details->'runs'->0->>'profile_number' LIKE 'test-dup-%')",
            "DELETE FROM legacy_changelog_ids WHERE changelog_id IN (SELECT id FROM changelog WHERE profile_number LIKE 'test-dup-%')",
            "UPDATE changelog SET coop_id = NULL WHERE profile_number LIKE 'test-dup-%'",
            "DELETE FROM coop_bundled WHERE mirror_of IN (SELECT id FROM coop_bundled WHERE p_id1 LIKE 'test-dup-%')",
            "DELETE FROM coop_bundled WHERE p_id1 LIKE 'test-dup-%'",
            "DELETE FROM changelog WHERE mirror_of IN (SELECT id FROM changelog WHERE profile_number LIKE 'test-dup-%')",
            "DELETE FROM changelog WHERE profile_number LIKE 'test-dup-%'",
            "DELETE FROM users WHERE profile_number LIKE 'test-dup-%'",
        ] {
            sqlx::query(sql).execute(&pool).await.unwrap();
        }
    };
    cleanup().await;
    sqlx::query("INSERT INTO users (profile_number, steam_name) VALUES ('test-dup-p', 'test-dup-p'), ('test-dup-q', 'test-dup-q')").execute(&pool).await.unwrap();
    // A run `hours_ago` hours back: submission 0 is a Steam sync run, 1 a demo submission.
    let run = |profile: &'static str, map: &'static str, score: i32, hours_ago: i32, submission: i32| {
        let pool = pool.clone();
        async move {
            sqlx::query_scalar::<_, i64>(
                "INSERT INTO changelog (timestamp, profile_number, score, map_id, banned, submission, category_id, verified) SELECT now() - make_interval(hours => $1), $2, $3, $4, false, $5, default_cat_id, $5 = 1 FROM maps WHERE steam_id = $4 RETURNING id",
            )
            .bind(hours_ago)
            .bind(profile)
            .bind(score)
            .bind(map)
            .bind(submission)
            .fetch_one(&pool)
            .await
            .unwrap()
        }
    };
    let legacy = |id: i64, legacy_id: i64| {
        let pool = pool.clone();
        async move {
            sqlx::query("INSERT INTO legacy_changelog_ids (game_id, legacy_id, changelog_id) VALUES (1, $1, $2)").bind(legacy_id).bind(id).execute(&pool).await.unwrap();
        }
    };
    let ban = |id: i64, note: &'static str| {
        let pool = pool.clone();
        async move {
            sqlx::query("UPDATE changelog SET banned = true, admin_note = $2 WHERE id = $1").bind(id).bind(note).execute(&pool).await.unwrap();
        }
    };
    let bundle = |a: i64, b: i64| {
        let pool = pool.clone();
        async move {
            let cb: i64 = sqlx::query_scalar("INSERT INTO coop_bundled (p_id1, p_id2, p1_is_host, cl_id1, cl_id2) VALUES ('test-dup-p', 'test-dup-q', true, $1, $2) RETURNING id")
                .bind(a)
                .bind(b)
                .fetch_one(&pool)
                .await
                .unwrap();
            sqlx::query("UPDATE changelog SET coop_id = $1 WHERE id IN ($2, $3)").bind(cb).bind(a).bind(b).execute(&pool).await.unwrap();
        }
    };
    let exists = |id: i64| {
        let pool = pool.clone();
        async move { sqlx::query_scalar::<_, bool>("SELECT EXISTS (SELECT 1 FROM changelog WHERE id = $1)").bind(id).fetch_one(&pool).await.unwrap() }
    };
    // The old board's run: 14.98 with its demo, 100 hours ago.
    let theirs = run("test-dup-p", "47756", 1498, 100, 1).await;
    legacy(theirs, -9001).await;
    // Steam's copy of it (the game's 15.01), seen after: deleted. Seen before the old board had 14.98: kept.
    // Better than the old board's: kept (a new improvement the old board may still list).
    let copy = run("test-dup-p", "47756", 1501, 1, 0).await;
    let earlier = run("test-dup-p", "47756", 1502, 103, 0).await;
    let better = run("test-dup-p", "47756", 1480, 1, 0).await;
    // One the first version of the rule hid, before the pull's look-back: deleted. One staff hid: kept.
    let hidden = run("test-dup-p", "47756", 1500, 99, 0).await;
    ban(hidden, "The old board already has an equal or better time from before this one, so it won't list it (hidden by the old-board sync)").await;
    let staff_hidden = run("test-dup-p", "47756", 1503, 98, 0).await;
    ban(staff_hidden, "Cheated").await;
    // Co-op: both halves Steam copies of the old board's run: both deleted. Only one half a copy: kept.
    let (theirs_p, theirs_q) = (run("test-dup-p", "47741", 900, 100, 1).await, run("test-dup-q", "47741", 900, 100, 1).await);
    legacy(theirs_p, -9002).await;
    legacy(theirs_q, -9003).await;
    let (copy_p, copy_q) = (run("test-dup-p", "47741", 905, 1, 0).await, run("test-dup-q", "47741", 905, 1, 0).await);
    bundle(copy_p, copy_q).await;
    let theirs_p2 = run("test-dup-p", "47825", 1000, 100, 1).await;
    legacy(theirs_p2, -9004).await;
    let (half_p, half_q) = (run("test-dup-p", "47825", 1005, 1, 0).await, run("test-dup-q", "47825", 1005, 1, 0).await);
    bundle(half_p, half_q).await;
    let since = chrono::Utc::now().naive_utc() - chrono::Duration::days(4);

    let mut report = BoardReport::default();
    let mut touched = HashSet::new();
    delete_duplicates(&pool, 1, since, &HashSet::new(), true, &mut report, &mut touched).await.unwrap();
    assert_eq!(report.deleted, 4, "{:?}", report.details);
    assert!(exists(copy).await && exists(hidden).await && exists(copy_p).await, "a dry run changes nothing");

    let mut report = BoardReport::default();
    delete_duplicates(&pool, 1, since, &HashSet::new(), false, &mut report, &mut touched).await.unwrap();
    assert_eq!(report.deleted, 4, "{:?}", report.details);
    assert!(report.errors.is_empty(), "{:?}", report.errors);
    assert!(report.details.iter().any(|d| d.contains("15.01") && d.contains("14.98")), "{:?}", report.details);
    assert_eq!((exists(copy).await, exists(hidden).await, exists(copy_p).await, exists(copy_q).await), (false, false, false, false));
    for kept in [earlier, better, theirs, staff_hidden, half_p, half_q, theirs_p, theirs_q] {
        assert!(exists(kept).await, "run {kept} is kept");
    }
    // The audit log keeps the deleted row.
    let logged: Option<String> = sqlx::query_scalar("SELECT details->'runs'->0->>'score' FROM admin_actions WHERE action = 'run.delete' AND via_service AND target_id = $1")
        .bind(copy.to_string())
        .fetch_optional(&pool)
        .await
        .unwrap();
    assert_eq!(logged.as_deref(), Some("1501"), "in the audit log with a copy of the row");
    assert!(touched.contains(&("47756".to_string(), false)) && touched.contains(&("47741".to_string(), true)), "the maps' ranks are refreshed");

    // Nothing left to do on the next pull.
    let mut report = BoardReport::default();
    delete_duplicates(&pool, 1, since, &HashSet::new(), false, &mut report, &mut touched).await.unwrap();
    assert_eq!(report.deleted, 0, "{:?}", report.details);
    cleanup().await;
}

#[actix_web::test]
async fn test_db_previews_list_equal_times_in_the_order_set() {
    use crate::models::coop::CoopPreview;
    use crate::models::sp::SpPreview;
    let (_, pool) = get_config().await.expect("Error getting config and DB pool");
    // Our own rows (removed again at the end): equal record times on Turret Intro and on Doors.
    let cleanup = || async {
        for sql in [
            "UPDATE changelog SET coop_id = NULL WHERE profile_number LIKE 'test-tie-%'",
            "DELETE FROM coop_bundled WHERE mirror_of IN (SELECT id FROM coop_bundled WHERE p_id1 LIKE 'test-tie-%')",
            "DELETE FROM coop_bundled WHERE p_id1 LIKE 'test-tie-%'",
            "DELETE FROM changelog WHERE mirror_of IN (SELECT id FROM changelog WHERE profile_number LIKE 'test-tie-%')",
            "DELETE FROM changelog WHERE profile_number LIKE 'test-tie-%'",
            "DELETE FROM users WHERE profile_number LIKE 'test-tie-%'",
        ] {
            sqlx::query(sql).execute(&pool).await.unwrap();
        }
    };
    cleanup().await;
    sqlx::query("INSERT INTO users (profile_number, steam_name) VALUES ('test-tie-a', 'test-tie-a'), ('test-tie-b', 'test-tie-b'), ('test-tie-c', 'test-tie-c'), ('test-tie-d', 'test-tie-d')")
        .execute(&pool)
        .await
        .unwrap();
    // A verified run `days_ago` back, in the map's main category, faster than any real record.
    let run = |profile: &'static str, map: &'static str, days_ago: i32| {
        let pool = pool.clone();
        async move {
            sqlx::query_scalar::<_, i64>(
                "INSERT INTO changelog (timestamp, profile_number, score, map_id, banned, submission, category_id, verified) SELECT now() - make_interval(days => $1), $2, 100, $3, false, 1, default_cat_id, true FROM maps WHERE steam_id = $3 RETURNING id",
            )
            .bind(days_ago)
            .bind(profile)
            .bind(map)
            .fetch_one(&pool)
            .await
            .unwrap()
        }
    };
    // The later run goes in first and belongs to the player whose ID sorts first, so neither table
    // order nor player order puts the earlier run on top: only the date does.
    run("test-tie-a", "47756", 1).await;
    run("test-tie-b", "47756", 30).await;
    let sp = SpPreview::get_sp_preview(&pool, "47756").await.unwrap();
    let names: Vec<&str> = sp.iter().take(2).map(|p| p.profile_number.as_str()).collect();
    assert_eq!(names, ["test-tie-b", "test-tie-a"], "the earlier of two equal times is the record");

    let bundle = |a: i64, b: i64, p1: &'static str, p2: &'static str| {
        let pool = pool.clone();
        async move {
            let cb: i64 = sqlx::query_scalar("INSERT INTO coop_bundled (p_id1, p_id2, p1_is_host, cl_id1, cl_id2) VALUES ($1, $2, true, $3, $4) RETURNING id")
                .bind(p1)
                .bind(p2)
                .bind(a)
                .bind(b)
                .fetch_one(&pool)
                .await
                .unwrap();
            sqlx::query("UPDATE changelog SET coop_id = $1 WHERE id IN ($2, $3)").bind(cb).bind(a).bind(b).execute(&pool).await.unwrap();
        }
    };
    let (late1, late2) = (run("test-tie-a", "47741", 1).await, run("test-tie-b", "47741", 1).await);
    bundle(late1, late2, "test-tie-a", "test-tie-b").await;
    let (early1, early2) = (run("test-tie-c", "47741", 30).await, run("test-tie-d", "47741", 30).await);
    bundle(early1, early2, "test-tie-c", "test-tie-d").await;
    let coop = CoopPreview::get_coop_preview(&pool, "47741").await.unwrap();
    assert_eq!(coop[0].profile_number1, "test-tie-c", "the earlier of two equal co-op times is the record");
    assert_eq!(coop[1].profile_number1, "test-tie-a");
    cleanup().await;
}
