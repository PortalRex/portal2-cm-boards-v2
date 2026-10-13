//! Per-client request limits for the endpoints that are expensive or abusable (sign-in, demo
//! uploads, reports, search, points history). Each `bucket` allows `max` requests per client
//! per `window`; over that, the client gets 429 until the window passes.
//!
//! Clients are told apart by IP. Behind a reverse proxy every connection comes from the proxy,
//! so `SERVER.BEHIND_PROXY=true` makes the server read the address the proxy forwards
//! (`X-Forwarded-For` / `Forwarded`) instead; without a proxy that header can't be trusted, as
//! anyone could send one to pick their own identity.
use crate::tools::config::Config;
use actix_web::{HttpRequest, HttpResponse};
use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

static BUCKETS: Mutex<Option<HashMap<(&'static str, String), (Instant, u32)>>> = Mutex::new(None);

/// The client's address as text: the forwarded one when behind a proxy, else the connection's.
pub fn client_ip(req: &HttpRequest, config: &Config) -> String {
    let info = req.connection_info();
    let ip = if config.server.behind_proxy() { info.realip_remote_addr() } else { info.peer_addr() };
    // peer_addr may carry a port; strip it (IPv6 literals are bracketed).
    let ip = ip.unwrap_or("unknown");
    let ip = match (ip.starts_with('['), ip.rfind(':')) {
        (true, _) => ip.split(']').next().unwrap_or(ip).trim_start_matches('['),
        (false, Some(i)) if ip.matches(':').count() == 1 => &ip[..i],
        _ => ip,
    };
    ip.to_string()
}

/// Counts a request against `bucket` for this client; Err(429) once over `max` per `window`.
pub fn check(req: &HttpRequest, config: &Config, bucket: &'static str, max: u32, window: Duration) -> Result<(), HttpResponse> {
    let key = (bucket, client_ip(req, config));
    let now = Instant::now();
    let mut guard = BUCKETS.lock().unwrap_or_else(|p| p.into_inner());
    let buckets = guard.get_or_insert_with(HashMap::new);
    // Keep the table small: drop finished windows now and then.
    if buckets.len() > 10_000 {
        buckets.retain(|_, (start, _)| now.duration_since(*start) < window);
    }
    let entry = buckets.entry(key).or_insert((now, 0));
    if now.duration_since(entry.0) >= window {
        *entry = (now, 0);
    }
    entry.1 += 1;
    if entry.1 > max {
        let wait = window.saturating_sub(now.duration_since(entry.0)).as_secs().max(1);
        return Err(HttpResponse::TooManyRequests()
            .insert_header(("Retry-After", wait.to_string()))
            .body(format!("Too many requests; try again in {wait} seconds.")));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limits_then_resets() {
        let mut buckets: HashMap<(&'static str, String), (Instant, u32)> = HashMap::new();
        let now = Instant::now();
        let e = buckets.entry(("t", "1.2.3.4".into())).or_insert((now, 0));
        e.1 += 3;
        assert!(e.1 > 2);
        assert!(now.duration_since(e.0) < Duration::from_secs(1));
    }
}
