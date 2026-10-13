use std::sync::atomic::{AtomicBool, Ordering};
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
}

impl ServerConfig {
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
}

/// How co-op runs are ranked (`RANKS.COOP`). `run` (the default): a run takes one rank, so the
/// next team down is rank 2. `player`: each player takes a rank, so a run fills two (1, 1, 3),
/// as the old boards ranked them.
#[derive(Deserialize, Debug, Clone, Default)]
pub struct RanksConfig {
    pub coop: Option<String>,
}

static COOP_BY_RUN: AtomicBool = AtomicBool::new(true);

/// Whether co-op runs take one rank each (see [RanksConfig]).
pub fn coop_by_run() -> bool {
    COOP_BY_RUN.load(Ordering::Relaxed)
}

impl RanksConfig {
    /// Sets the co-op ranking for the whole server; called once at startup.
    pub fn apply(&self) {
        let by_player = self.coop.as_deref().map(str::trim).is_some_and(|m| m.eq_ignore_ascii_case("player"));
        COOP_BY_RUN.store(!by_player, Ordering::Relaxed);
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
