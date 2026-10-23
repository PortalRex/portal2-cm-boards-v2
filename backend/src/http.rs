//! HTTP clients for calling the board's server. Requests carry the service token
//! (`SERVICE_TOKEN` in ./.env, matching the server's `SERVICE.TOKEN`), which the server
//! requires for every endpoint that changes data.
use reqwest::header::{HeaderMap, HeaderValue};

fn service_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    if let Ok(token) = dotenv::var("SERVICE_TOKEN") {
        if let Ok(value) = HeaderValue::from_str(&token) {
            headers.insert("X-Service-Token", value);
        }
    }
    headers
}

pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .default_headers(service_headers())
        .build()
        .expect("HTTP client")
}

pub fn blocking_client() -> reqwest::blocking::Client {
    reqwest::blocking::Client::builder()
        .default_headers(service_headers())
        .build()
        .expect("HTTP client")
}
