//! Per-client request limits for the endpoints that are expensive or abusable (sign-in, demo
//! uploads, reports, search, points history). Each `bucket` allows `max` requests per client
//! per `window`; over that, the client gets 429 until the window passes.
//!
//! Clients are told apart by IP. Behind a reverse proxy every connection comes from the proxy,
//! so `SERVER.BEHIND_PROXY=true` makes the server read the address the proxy forwards instead:
//! the last `X-Forwarded-For` entry, the one the proxy in front added. Earlier entries, and the
//! `Forwarded` header, come from the client and could be anything, so they're never used (a
//! client sending `Forwarded: for=<anything>` got a fresh allowance on every request). Without a
//! proxy no forwarded header can be trusted, as anyone could send one to pick their own identity.
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
    let forwarded = req.headers().get("X-Forwarded-For").and_then(|v| v.to_str().ok());
    let info = req.connection_info();
    let ip = match forwarded.filter(|_| config.server.behind_proxy()) {
        Some(list) => last_forwarded(list),
        None => info.peer_addr(),
    };
    // peer_addr may carry a port; strip it (IPv6 literals are bracketed).
    let ip = ip.unwrap_or("unknown");
    let ip = match (ip.starts_with('['), ip.rfind(':')) {
        (true, _) => ip.split(']').next().unwrap_or(ip).trim_start_matches('['),
        (false, Some(i)) if ip.matches(':').count() == 1 => &ip[..i],
        _ => ip,
    };
    ip.to_string()
}

/// The last address in an `X-Forwarded-For` list: the one the nearest proxy added.
fn last_forwarded(list: &str) -> Option<&str> {
    list.rsplit(',').map(str::trim).find(|ip| !ip.is_empty())
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

/// Whether the client is over `max` in `bucket` this window, without counting this request (for
/// limits that only count failures, checked before the attempt).
pub fn exceeded(req: &HttpRequest, config: &Config, bucket: &'static str, max: u32, window: Duration) -> bool {
    let key = (bucket, client_ip(req, config));
    let guard = BUCKETS.lock().unwrap_or_else(|p| p.into_inner());
    guard
        .as_ref()
        .and_then(|b| b.get(&key))
        .is_some_and(|(start, count)| Instant::now().duration_since(*start) < window && *count >= max)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn forwarded_address_is_the_last_entry() {
        assert_eq!(last_forwarded("203.0.113.9"), Some("203.0.113.9"));
        // Entries before the proxy's own are the client's to choose.
        assert_eq!(last_forwarded("1.1.1.1, 2.2.2.2, 203.0.113.9"), Some("203.0.113.9"));
        assert_eq!(last_forwarded("1.1.1.1, 203.0.113.9 , "), Some("203.0.113.9"));
        assert_eq!(last_forwarded("2001:db8::1"), Some("2001:db8::1"));
        assert_eq!(last_forwarded(" , "), None);
    }

    #[test]
    fn spoofed_forwarded_headers_dont_change_the_address() {
        let config: Config = serde_json::from_value(serde_json::json!({
            "database_url": "", "server": { "host": "", "port": 0, "behind_proxy": true },
            "proof": { "results": 0, "demo": 0, "video": 0 }, "steam": { "api_key": "" },
            "backblaze": { "keyid": "", "key": "", "bucket": "" },
        }))
        .unwrap();
        let req = |headers: &[(&str, &str)]| {
            let mut r = actix_web::test::TestRequest::default();
            for (k, v) in headers {
                r = r.insert_header((*k, *v));
            }
            r.to_http_request()
        };
        let proxied = req(&[("X-Forwarded-For", "203.0.113.9")]);
        assert_eq!(client_ip(&proxied, &config), "203.0.113.9");
        for spoofed in [
            req(&[("X-Forwarded-For", "203.0.113.9"), ("Forwarded", "for=10.9.9.9")]),
            req(&[("X-Forwarded-For", "10.9.9.9, 203.0.113.9")]),
        ] {
            assert_eq!(client_ip(&spoofed, &config), "203.0.113.9");
        }
    }

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
