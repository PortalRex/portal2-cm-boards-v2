use std::sync::{
    atomic::{AtomicBool, Ordering},
    OnceLock,
};
use config::ConfigError;
use serde::Deserialize;

/// Server hosting information for mounting the webserver.
#[derive(Deserialize, Debug, Clone)]
pub struct ServerConfig {
    pub host: String,
    pub port: i32,
    /// Public address of the site, which serves the API under /api (e.g.
    /// `https://board.portal2.sr`). Steam sign-in returns here, and session cookies are
    /// marked Secure when it's https. Defaults to http://localhost:3000 (the dev frontend).
    pub public_url: Option<String>,
    /// Set when a reverse proxy sits in front: client addresses (for rate limits and report
    /// de-duplication) are then read from the proxy's X-Forwarded-For header. Leave unset when
    /// clients connect directly, as that header can't be trusted then.
    pub behind_proxy: Option<bool>,
    /// Staff-only mode ([crate::tools::private_site]): the data needs a signed-in staff account.
    pub private: Option<bool>,
}

impl ServerConfig {
    pub fn private(&self) -> bool {
        self.private.unwrap_or(false)
    }

    pub fn behind_proxy(&self) -> bool {
        self.behind_proxy.unwrap_or(false)
    }

    pub fn public_url(&self) -> &str {
        self.public_url.as_deref().filter(|u| !u.is_empty()).unwrap_or("http://localhost:3000").trim_end_matches('/')
    }
}
/// The proof standards, update based on the mod tools desired.
#[derive(Deserialize, Debug, Clone)]
pub struct ProofConfig {
    pub results: i32,
    pub demo: i32,
    pub video: i32,
}

/// Authentication information used to interact with BackBlaze's storage API.
#[derive(Deserialize, Debug, Clone)]
pub struct BackBlazeConfig {
    pub keyid: String,
    pub key: String,
    pub bucket: String,
}


#[derive(Deserialize, Debug, Clone)]
pub struct SteamConfig {
    pub api_key: String,
}

/// Shared secret for the board's own services (the Steam leaderboard fetcher and points
/// calculator in /backend), sent in an `X-Service-Token` header. People use Steam sign-in.
/// Service access is disabled when it's unset.
#[derive(Deserialize, Debug, Clone, Default)]
pub struct ServiceConfig {
    pub token: Option<String>,
}

/// Submitted demos: the Node parser that reads them (`server/demo-parser`) and where uploads are
/// kept. Submissions by players are refused while `parser` or `storage` is unset.
#[derive(Deserialize, Debug, Clone, Default)]
pub struct DemoConfig {
    /// Path to `parse_demo.mjs` (with its `node_modules` installed).
    pub parser: Option<String>,
    /// Node executable (default `node`).
    pub node: Option<String>,
    /// Directory submitted demos are saved to.
    pub storage: Option<String>,
    /// Folders holding the old boards' demos (searched recursively; several separated by `;`),
    /// so their runs' demos can be downloaded.
    pub archive: Option<String>,
    /// Read every demo in the background ([crate::tools::demo_parse]); on unless set to false.
    pub auto_parse: Option<bool>,
    /// Threads the demo parser uses (default 4); it also runs at idle priority on Windows, so
    /// reading the archive doesn't get in the way of anything else on the machine.
    pub parse_workers: Option<u32>,
}

impl DemoConfig {
    pub fn auto_parse(&self) -> bool {
        self.auto_parse.unwrap_or(true) && self.parser.as_deref().is_some_and(|p| !p.is_empty())
    }
    pub fn parse_workers(&self) -> u32 {
        self.parse_workers.filter(|w| *w > 0).unwrap_or(4)
    }
}

/// How co-op runs are ranked (`RANKS.COOP`). `run` (the default): a run takes one rank, so the
/// next team down is rank 2. `player`: each player takes a rank, so a run fills two (1, 1, 3),
/// as the old boards ranked them.
///
/// `RANKS.COOP_PROOF_SINCE` (UTC, e.g. `2026-11-01 00:00:00`, set to when the site goes fully
/// online): co-op runs from then on that rank in the top 200 stay pending for both players until
/// each has added a demo. Unset, the rule is off and one demo verifies both halves.
#[derive(Deserialize, Debug, Clone, Default)]
pub struct RanksConfig {
    pub coop: Option<String>,
    pub coop_proof_since: Option<String>,
}

static COOP_BY_RUN: AtomicBool = AtomicBool::new(true);
static COOP_PROOF_SINCE: OnceLock<Option<String>> = OnceLock::new();

/// When co-op runs started needing both players' demos (see [RanksConfig]), if set.
pub fn coop_proof_since() -> Option<&'static str> {
    COOP_PROOF_SINCE.get().and_then(|s| s.as_deref())
}

/// Whether co-op runs take one rank each (see [RanksConfig]).
pub fn coop_by_run() -> bool {
    COOP_BY_RUN.load(Ordering::Relaxed)
}

impl RanksConfig {
    /// Sets the co-op ranking for the whole server; called once at startup.
    pub fn apply(&self) {
        let by_player = self.coop.as_deref().map(str::trim).is_some_and(|m| m.eq_ignore_ascii_case("player"));
        COOP_BY_RUN.store(!by_player, Ordering::Relaxed);
        let since = self.coop_proof_since.as_deref().map(str::trim).filter(|s| !s.is_empty());
        if let Some(s) = since {
            if chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S").is_err() {
                panic!("RANKS.COOP_PROOF_SINCE must look like 2026-11-01 00:00:00 (UTC), got {s:?}");
            }
        }
        let _ = COOP_PROOF_SINCE.set(since.map(str::to_string));
    }
}

/// Pulling new Portal 2 times from Steam's leaderboards ([crate::tools::steam_sync]).
#[derive(Deserialize, Debug, Clone, Default)]
pub struct SyncConfig {
    /// On with `SYNC.STEAM=true`; off by default until the first full pass has been reviewed.
    pub steam: Option<bool>,
    /// Minutes between passes (default 10).
    pub minutes: Option<u64>,
    /// Times are pulled when they're in a map's top this many on Steam (default 500, the old
    /// boards' window).
    pub rank_limit: Option<i32>,
    /// Pulling from the old boards until they're retired ([crate::tools::old_boards_sync]): on
    /// with `SYNC.OLD_BOARDS=true`.
    pub old_boards: Option<bool>,
    /// Hours of the day to pull, in `SYNC.OLD_BOARDS_TZ` (default "0,12": midnight and noon).
    pub old_boards_hours: Option<String>,
    /// Time zone of those hours (default America/Chicago).
    pub old_boards_tz: Option<String>,
    /// Each pull re-reads at least this many days of the old boards' changelogs (default 3), so
    /// later changes there (bans, demos, videos) are picked up.
    pub old_boards_days: Option<i64>,
    /// The old boards' addresses (defaults: https://board.portal2.sr, https://mel.portal2.sr).
    pub portal2_board_url: Option<String>,
    pub mel_board_url: Option<String>,
}

impl SyncConfig {
    pub fn old_boards(&self) -> bool {
        self.old_boards.unwrap_or(false)
    }
    pub fn old_boards_hours(&self) -> Vec<u32> {
        let hours: Vec<u32> = self.old_boards_hours.as_deref().unwrap_or("0,12").split(',').filter_map(|h| h.trim().parse().ok()).filter(|h| *h < 24).collect();
        if hours.is_empty() { vec![0, 12] } else { hours }
    }
    pub fn old_boards_tz(&self) -> chrono_tz::Tz {
        self.old_boards_tz.as_deref().and_then(|t| t.parse().ok()).unwrap_or(chrono_tz::America::Chicago)
    }
    pub fn old_boards_days(&self) -> i64 {
        self.old_boards_days.filter(|d| *d > 0).unwrap_or(3)
    }
    pub fn portal2_board_url(&self) -> String {
        self.portal2_board_url.clone().filter(|u| !u.is_empty()).unwrap_or_else(|| "https://board.portal2.sr".into()).trim_end_matches('/').to_string()
    }
    pub fn mel_board_url(&self) -> String {
        self.mel_board_url.clone().filter(|u| !u.is_empty()).unwrap_or_else(|| "https://mel.portal2.sr".into()).trim_end_matches('/').to_string()
    }
    pub fn steam(&self) -> bool {
        self.steam.unwrap_or(false)
    }
    pub fn minutes(&self) -> u64 {
        self.minutes.filter(|m| *m > 0).unwrap_or(10)
    }
    pub fn rank_limit(&self) -> i32 {
        self.rank_limit.filter(|r| *r > 0).unwrap_or(500)
    }
}

/// Wrapper for all other config variables.
#[derive(Deserialize, Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub server: ServerConfig,
    pub proof: ProofConfig,
    pub steam: SteamConfig,
    pub backblaze: BackBlazeConfig,
    #[serde(default)]
    pub service: ServiceConfig,
    #[serde(default)]
    pub demo: DemoConfig,
    #[serde(default)]
    pub ranks: RanksConfig,
    #[serde(default)]
    pub sync: SyncConfig,
}
// Extracts the environment variables from the .env file at the src level.
impl Config {
    /// The function fall that attempts to parse the `.env`
    pub fn from_env() -> Result<Self, ConfigError> {
        let mut cfg = config::Config::new();
        cfg.merge(config::Environment::new())?;
        cfg.try_into()
    }
}
