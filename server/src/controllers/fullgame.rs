//! Read-only queries for the full-game boards. Board rules follow speedrun.com, as in
//! PortalRex/fullgame-boards (classes/FullGame.php).
use crate::models::fullgame::*;
use sqlx::PgPool;
use std::collections::{BTreeMap, HashMap, HashSet};

const RUN_SELECT: &str = r#"
    SELECT r.id, r.category_id, r.level_id, r.time_ms, r.run_date, r.submitted_at, r.status,
           r.examiner_name, r.examined_at, r.reject_reason, r.comment, r.video_url, r.demo_url,
           (r.demo_file IS NOT NULL) AS has_demo_file, r.src_id,
           c.name AS category_name, c.slug AS category_slug, c.players, c.type AS category_type,
           g.id AS game_id, g.name AS game_name, g.slug AS game_slug,
           l.name AS level_name, l.slug AS level_slug
    FROM fg_runs AS r
        INNER JOIN fg_categories AS c ON (c.id = r.category_id)
        INNER JOIN fg_games AS g ON (g.id = c.game_id)
        LEFT JOIN fg_levels AS l ON (l.id = r.level_id)
"#;

pub async fn games(pool: &PgPool) -> Result<Vec<FgGameSummary>, sqlx::Error> {
    let games = sqlx::query_as::<_, FgGame>("SELECT * FROM fg_games ORDER BY sort, name")
        .fetch_all(pool)
        .await?;
    let mut out = Vec::with_capacity(games.len());
    for game in games {
        let categories = categories(pool, game.id).await?;
        out.push(FgGameSummary { game, categories });
    }
    Ok(out)
}

pub async fn game(pool: &PgPool, slug: &str) -> Result<Option<FgGame>, sqlx::Error> {
    sqlx::query_as::<_, FgGame>("SELECT * FROM fg_games WHERE slug = $1")
        .bind(slug)
        .fetch_optional(pool)
        .await
}

pub async fn categories(pool: &PgPool, game_id: i32) -> Result<Vec<FgCategory>, sqlx::Error> {
    sqlx::query_as::<_, FgCategory>("SELECT * FROM fg_categories WHERE game_id = $1 ORDER BY miscellaneous, sort, name")
        .bind(game_id)
        .fetch_all(pool)
        .await
}

pub async fn levels(pool: &PgPool, game_id: i32) -> Result<Vec<FgLevel>, sqlx::Error> {
    sqlx::query_as::<_, FgLevel>("SELECT * FROM fg_levels WHERE game_id = $1 ORDER BY sort, name")
        .bind(game_id)
        .fetch_all(pool)
        .await
}

pub async fn game_page(pool: &PgPool, slug: &str) -> Result<Option<FgGamePage>, sqlx::Error> {
    let Some(game) = game(pool, slug).await? else { return Ok(None) };
    let categories = categories(pool, game.id).await?;
    let levels = levels(pool, game.id).await?;
    Ok(Some(FgGamePage { game, categories, levels }))
}

/// Variables that apply to a category (and level), each with its values.
/// Scope follows SRC: global, full_game, all_levels, single_level.
pub async fn variables(pool: &PgPool, category: &FgCategory, level_id: Option<i32>) -> Result<Vec<FgVariable>, sqlx::Error> {
    let rows = sqlx::query_as::<_, FgVariable>(
        "SELECT id, game_id, category_id, level_id, name, scope, is_subcategory, mandatory, sort
            FROM fg_variables
            WHERE game_id = $1 AND (category_id IS NULL OR category_id = $2)
            ORDER BY sort, id",
    )
    .bind(category.game_id)
    .bind(category.id)
    .fetch_all(pool)
    .await?;
    let per_level = category.kind == "per_level";
    let applies = |v: &FgVariable| match v.scope.as_str() {
        "full_game" => !per_level,
        "all_levels" => per_level,
        "single_level" => per_level && v.level_id == level_id,
        _ => true,
    };
    let mut variables: Vec<FgVariable> = rows.into_iter().filter(applies).collect();
    let ids: Vec<i32> = variables.iter().map(|v| v.id).collect();
    let values = sqlx::query_as::<_, FgVariableValue>(
        "SELECT id, variable_id, label, slug, sort FROM fg_variable_values WHERE variable_id = ANY($1) ORDER BY sort, id",
    )
    .bind(&ids)
    .fetch_all(pool)
    .await?;
    for value in values {
        if let Some(variable) = variables.iter_mut().find(|v| v.id == value.variable_id) {
            variable.values.push(value);
        }
    }
    Ok(variables)
}

/// Runners and variable values for a set of runs.
async fn attach_details(pool: &PgPool, rows: Vec<FgRunRow>) -> Result<Vec<FgRun>, sqlx::Error> {
    let ids: Vec<i32> = rows.iter().map(|r| r.id).collect();
    let runners = sqlx::query_as::<_, FgRunRunner>(
        r#"SELECT rr.run_id, rr.position, ru.id, ru.name, ru.profile_number, u.avatar
            FROM fg_run_runners AS rr
                INNER JOIN fg_runners AS ru ON (ru.id = rr.runner_id)
                LEFT JOIN users AS u ON (u.profile_number = ru.profile_number)
            WHERE rr.run_id = ANY($1)
            ORDER BY rr.run_id, rr.position"#,
    )
    .bind(&ids)
    .fetch_all(pool)
    .await?;
    let values = sqlx::query_as::<_, FgRunValue>(
        r#"SELECT rv.run_id, v.id AS variable_id, v.name AS variable, v.is_subcategory, vv.id AS value_id, vv.label, vv.slug
            FROM fg_run_values AS rv
                INNER JOIN fg_variables AS v ON (v.id = rv.variable_id)
                INNER JOIN fg_variable_values AS vv ON (vv.id = rv.value_id)
            WHERE rv.run_id = ANY($1)
            ORDER BY v.sort, v.id"#,
    )
    .bind(&ids)
    .fetch_all(pool)
    .await?;
    let mut runners_by: HashMap<i32, Vec<FgRunRunner>> = HashMap::new();
    for r in runners {
        runners_by.entry(r.run_id).or_default().push(r);
    }
    let mut values_by: HashMap<i32, Vec<FgRunValue>> = HashMap::new();
    for v in values {
        values_by.entry(v.run_id).or_default().push(v);
    }
    Ok(rows
        .into_iter()
        .map(|run| FgRun {
            runners: runners_by.remove(&run.id).unwrap_or_default(),
            values: values_by.remove(&run.id).unwrap_or_default(),
            rank: None,
            obsolete: false,
            run,
        })
        .collect())
}

/// Rank runs (sorted by time) like speedrun.com: a run stays on the board while it is the
/// best run of at least one of its runners (a co-op pair's run is obsolete once each runner
/// has a faster run, with any partner). Equal times share a rank.
pub fn rank(runs: Vec<FgRun>, include_obsolete: bool) -> Vec<FgRun> {
    let mut seen = HashSet::new();
    let mut out = Vec::with_capacity(runs.len());
    let (mut rank, mut position, mut previous) = (0, 0, None);
    for mut run in runs {
        let mut fresh = false;
        for runner in &run.runners {
            fresh |= seen.insert(runner.id);
        }
        if !fresh {
            if include_obsolete {
                run.obsolete = true;
                run.rank = None;
                out.push(run);
            }
            continue;
        }
        position += 1;
        if previous != Some(run.run.time_ms) {
            rank = position;
        }
        previous = Some(run.run.time_ms);
        run.obsolete = false;
        run.rank = Some(rank);
        out.push(run);
    }
    out
}

/// Verified runs of a category/level matching every subcategory filter (variable id ->
/// value id), ranked.
pub async fn ranked_runs(
    pool: &PgPool,
    category_id: i32,
    level_id: Option<i32>,
    filters: &BTreeMap<i32, i32>,
    include_obsolete: bool,
) -> Result<Vec<FgRun>, sqlx::Error> {
    let (variable_ids, value_ids): (Vec<i32>, Vec<i32>) = filters.iter().map(|(k, v)| (*k, *v)).unzip();
    let sql = format!(
        r#"{RUN_SELECT}
        WHERE r.category_id = $1 AND r.status = 'verified'
            AND r.level_id IS NOT DISTINCT FROM $2
            AND (SELECT COUNT(*) FROM fg_run_values AS f
                    INNER JOIN UNNEST($3::int[], $4::int[]) AS want(variable_id, value_id)
                        ON (want.variable_id = f.variable_id AND want.value_id = f.value_id)
                    WHERE f.run_id = r.id) = $5
        ORDER BY r.time_ms, r.run_date, r.id"#
    );
    let rows = sqlx::query_as::<_, FgRunRow>(&sql)
        .bind(category_id)
        .bind(level_id)
        .bind(&variable_ids)
        .bind(&value_ids)
        .bind(filters.len() as i64)
        .fetch_all(pool)
        .await?;
    Ok(rank(attach_details(pool, rows).await?, include_obsolete))
}

/// A leaderboard page. `level_slug` is required for per-level categories (defaults to the
/// first level); `query` holds `v<variable id>=<value slug>` subcategory selections, each
/// defaulting to the variable's first value.
pub async fn board(
    pool: &PgPool,
    game_slug: &str,
    category_slug: &str,
    level_slug: Option<&str>,
    query: &HashMap<String, String>,
    include_obsolete: bool,
) -> Result<Option<FgBoard>, sqlx::Error> {
    let Some(game) = game(pool, game_slug).await? else { return Ok(None) };
    let Some(category) = sqlx::query_as::<_, FgCategory>("SELECT * FROM fg_categories WHERE game_id = $1 AND slug = $2")
        .bind(game.id)
        .bind(category_slug)
        .fetch_optional(pool)
        .await?
    else {
        return Ok(None);
    };
    let levels = if category.kind == "per_level" { levels(pool, game.id).await? } else { Vec::new() };
    let level = if category.kind == "per_level" {
        match level_slug {
            Some(slug) => match levels.iter().find(|l| l.slug == slug) {
                Some(l) => Some(l.clone()),
                None => return Ok(None),
            },
            None => match levels.first() {
                Some(l) => Some(l.clone()),
                None => return Ok(None),
            },
        }
    } else {
        None
    };
    let level_id = level.as_ref().map(|l| l.id);
    let variables = variables(pool, &category, level_id).await?;
    let mut filters = BTreeMap::new();
    let mut selected = BTreeMap::new();
    for variable in variables.iter().filter(|v| v.is_subcategory && !v.values.is_empty()) {
        let wanted = query.get(&format!("v{}", variable.id));
        let chosen = wanted
            .and_then(|slug| variable.values.iter().find(|v| &v.slug == slug))
            .unwrap_or(&variable.values[0]);
        filters.insert(variable.id, chosen.id);
        selected.insert(variable.id, chosen.slug.clone());
    }
    let runs = ranked_runs(pool, category.id, level_id, &filters, include_obsolete).await?;
    Ok(Some(FgBoard { game, category, level, levels, variables, selected, runs }))
}

pub async fn run_page(pool: &PgPool, id: i32) -> Result<Option<FgRunPage>, sqlx::Error> {
    let Some(row) = sqlx::query_as::<_, FgRunRow>(&format!("{RUN_SELECT} WHERE r.id = $1"))
        .bind(id)
        .fetch_optional(pool)
        .await?
    else {
        return Ok(None);
    };
    let mut run = attach_details(pool, vec![row]).await?.remove(0);
    if run.run.status == "verified" {
        // Place on its board, using the run's own subcategory values.
        let filters: BTreeMap<i32, i32> = run.values.iter().filter(|v| v.is_subcategory).map(|v| (v.variable_id, v.value_id)).collect();
        let board = ranked_runs(pool, run.run.category_id, run.run.level_id, &filters, true).await?;
        if let Some(placed) = board.iter().find(|r| r.run.id == run.run.id) {
            run.rank = placed.rank;
            run.obsolete = placed.obsolete;
        }
    }
    let events = sqlx::query_as::<_, FgRunEvent>(
        r#"SELECT e.action, e.note, e.created_at, COALESCE(u.board_name, u.steam_name) AS actor_name
            FROM fg_run_events AS e
                LEFT JOIN users AS u ON (u.profile_number = e.actor)
            WHERE e.run_id = $1
            ORDER BY e.created_at, e.id"#,
    )
    .bind(id)
    .fetch_all(pool)
    .await?;
    Ok(Some(FgRunPage { run, events }))
}

/// A runner and their runs, newest first. Verified runs carry their current rank (or
/// obsolete flag) on their board.
pub async fn runner_page(pool: &PgPool, id: i32) -> Result<Option<FgRunnerPage>, sqlx::Error> {
    let Some(runner) = sqlx::query_as::<_, FgRunner>(
        r#"SELECT ru.id, ru.profile_number, ru.src_user_id, ru.src_guest_name, ru.name, u.avatar
            FROM fg_runners AS ru LEFT JOIN users AS u ON (u.profile_number = ru.profile_number)
            WHERE ru.id = $1"#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    else {
        return Ok(None);
    };
    let rows = sqlx::query_as::<_, FgRunRow>(&format!(
        "{RUN_SELECT} INNER JOIN fg_run_runners AS mine ON (mine.run_id = r.id AND mine.runner_id = $1)
            ORDER BY r.run_date DESC NULLS LAST, r.id DESC LIMIT 500"
    ))
    .bind(id)
    .fetch_all(pool)
    .await?;
    let mut runs = attach_details(pool, rows).await?;

    // Rank each distinct board the runner appears on once.
    let mut boards: HashMap<(i32, Option<i32>, BTreeMap<i32, i32>), Vec<FgRun>> = HashMap::new();
    for run in runs.iter_mut().filter(|r| r.run.status == "verified") {
        let filters: BTreeMap<i32, i32> = run.values.iter().filter(|v| v.is_subcategory).map(|v| (v.variable_id, v.value_id)).collect();
        let key = (run.run.category_id, run.run.level_id, filters.clone());
        if !boards.contains_key(&key) {
            let board = ranked_runs(pool, key.0, key.1, &filters, true).await?;
            boards.insert(key.clone(), board);
        }
        if let Some(placed) = boards[&key].iter().find(|r| r.run.id == run.run.id) {
            run.rank = placed.rank;
            run.obsolete = placed.obsolete;
        }
    }
    Ok(Some(FgRunnerPage { runner, runs }))
}
